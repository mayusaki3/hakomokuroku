# RestoreSession 設計判断記録

更新: 2026-09-16
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`
状態: 設計確定事項

## 1. 目的
backup/restore時に複数entityの内容競合が発生した場合、利用者が1件ずつ判断している途中で画面を閉じたりアプリを終了したりしても、判断済み内容を失わず後から再開できるようにする。

## 2. restore競合の基本方針
- 同一identityでbusiness content同一ならUNCHANGED相当。
- business content差異は`KEEP_EXISTING / USE_BACKUP`を利用者が選択する。
- `updatedAt`で自動勝者を決めない。
- `USE_BACKUP`は通常local business updateとして反映しOutboxを生成する。backup側sync metadataは導入しない。

## 3. RestoreSession
```text
RestoreSession
- id
- backupHash
- status: PREPARING | RESOLVING | APPLYING | COMPLETED | CANCELLED | ERROR
- createdAt
- updatedAt
- appliedAt?
- currentConflictIndex
```
- backup内容をstagingへ保持し、元backupファイル再指定なしで再開可能にする。
- `appliedAt`はBusiness / Outboxと同一transactionでcommitされる適用済みmarker。

## 4. RestoreConflict
```text
RestoreConflict
- restoreSessionId
- entityType
- entityId
- conflictType
- existingSnapshot
- existingContentHash
- backupSnapshot
- resolution: null | KEEP_EXISTING | USE_BACKUP
- stale
- resolvedAt
```
- 判断ごとに即時永続化する。
- RESOLVING中も通常編集を許可する。
- APPLYING直前にcurrent business contentHashと`existingContentHash`を再比較する。
- 不一致の競合だけstale化してresolutionを無効化し、最新existing vs backupを再判断する。
- 他の判断済みresolutionは維持する。

## 5. 中断・再開
- `RESOLVING`中は任意に中断可能。
- session / staging / resolutionを保持する。
- 競合選択中はBusiness / SyncState / Outboxへ部分適用しない。
- 起動時に未完了sessionを検出して再開可能にする。
- APPLYING前ならキャンセル可能。Business未変更のままstagingを破棄する。

## 6. APPLYING
- 全競合解決 + staleなしでのみ開始する。
- APPLYING開始後の利用者手動中断は提供しない。
- Business更新、参照修正、contentHash再計算、Outbox生成/更新、`RestoreSession.appliedAt`を可能な限り単一IndexedDB readwrite transactionに含める。
- transaction失敗は全rollbackし部分restoreを残さない。
- stale検証後からcommitまで競合Business writeを直列化する。
- `APPLYING + appliedAtあり`なら再適用せずCOMPLETEDへ収束する。
- `APPLYING + appliedAtなし`なら未commitとして安全に再試行する。

## 7. active RestoreSession数
- User local DBごとにactive未完了sessionは最大1件。
- active=`PREPARING / RESOLVING / APPLYING / ERROR(retryable)`。
- active session中は新規restore開始禁止。
- 既存sessionを再開、またはAPPLYING前ならキャンセルしてから新規restoreする。
- COMPLETED / CANCELLEDはactiveに数えずcleanup対象。

## 8. backupの自己完結性と写真 — 確定
- 通常backupはserverや元端末へ依存せず復元できる自己完結型とし、Businessデータ、thumbnail、保存原画像を含める。
- device namespace、SyncState、Outbox、restore staging、tombstoneは含めない。

## 9. RestoreSession stagingの写真保持 — 確定
- Business stagingとoriginal blob stagingを論理的に分離する。
- original blobはRestoreSession専用blob stagingへ保持する。
- RESOLVING中はblob stagingを保持し、元backupファイルなしで再開可能にする。
- 最終結果でcanonical Businessから参照される写真だけを適用対象とする。
- キャンセル時はblob stagingを削除可能。
- staging作成時にoriginal bytesからphotoHashを再計算しmanifest値と照合する。

## 10. staging容量不足 — 確定
- `PREPARING`でbackup manifestを検証し必要staging容量を見積もる。
- quota/usageは参考値、実際のIndexedDB staging write成功を最終判定とする。
- Businessへ一切反映する前にstaging copyを完了する。
- quota不足/write failure/hash不一致等ならPREPARING失敗とし途中stagingをcleanupする。

## 11. 現行実装との差異
現行`apps/web/src/lib/backup.ts`は`hakomokuroku-backup@1`のJSONでBox/Item中心、`photoThumbs`を扱い、original blobを含まず、BoxLocationも対象外である。現行mergeは`updatedAt`で勝者を選び、replaceではID再採番を行う。確定仕様・テスト完成後の実装段階で置換対象とする。

## 12. backup container形式 — 確定
```text
<backup container: ZIP>
├─ manifest.json
├─ checksums.json
├─ photos/
│  └─ <photoId>.webp
└─ thumbnails/
   └─ <photoId>.webp
```
- container物理形式はZIP、論理schema versionはmanifestで管理する。
- JSONへのBase64埋め込みは使用しない。
- 現行JSONとのlegacy互換は必須にしない。

## 13. thumbnail backup entry — 確定
- path=`thumbnails/<photoId>.webp`。
- manifestに`thumbnailPath`, `thumbnailHash`, `thumbnailSize`を保持する。
- `thumbnailHash`はbackup integrity専用でparent Business `contentHash`には含めない。
- 欠落・hash不一致・size不一致ならPREPARING失敗。originalから暗黙再生成しない。

## 14. backup container integrity — 確定
- v0.8は破損検出を目的とし暗号署名/MACは導入しない。
- root `checksums.json`で`manifest.json`を含む全論理entryをSHA-256検証する。
- PREPARINGでpath安全性、重複、必須entry、schema、hash、manifest mappingを検証する。
- 意図的改ざんの真正性保証はv0.8対象外。

## 15. backup file identity — 確定
```text
extension : .hkmbackup
MIME type : application/vnd.hakomokuroku.backup+zip
file name : hakomokuroku-backup-YYYYMMDD-HHmmss.hkmbackup
```
- filename timestampは利用者local timeの表示情報。
- 正本時刻は`manifest.json.exportedAt` UTC RFC3339 milliseconds。
- extension/MIMEだけを信用せず内容を検証する。
- valid contentならMIMEが空/`application/zip`、または別extensionでもrestore可能。
- `application/vnd.hakomokuroku.backup+zip`は箱目録が使用するvendor-tree形式のMedia Type名であり、v0.8時点でIANA正式登録済みであることを意味しない。

## 16. backup export時のoriginal収集 — 確定
- export開始時にactive Business snapshotを固定する。
- snapshotから必要な全`photoId / photoHash`を列挙する。
- local original cacheのblobは実bytes hash一致時のみ利用する。
- localに無い/不正なら認証済みserver original APIから取得しhash検証する。
- 全originalが揃うまで完成backupを出力しない。
- offline不足、server取得不能/hash不一致はexport失敗。不完全backupを生成しない。
- export途中のBusiness編集は許可し、対象は開始時snapshotに固定する。

## 17. backup取得originalのlocal cache policy — 確定
- backup生成だけを理由としてserverから取得したoriginalを通常local original cacheへ永続追加しない。
- server取得originalはZIP生成に必要な期間だけbackup専用一時データとして保持する。
- backup処理は通常cacheのLRU/最終利用時刻を更新しない。
- 通常cacheへの保存は閲覧/明示download等の通常cache policyに従う。
- 可能ならserver responseをZIP writerへ逐次渡し、temporary storageが必要なら通常cacheと別namespace/storeにする。

## 18. backup exportの中断・再開 — 確定
- v0.8ではpersistent resumable jobにせず1回のforeground operationとする。
- 利用者キャンセルは許可する。
- page/PWA終了やsuspensionで失われた場合は最初から再実行する。
- 未完成`.hkmbackup`を完成backupとして保存しない。
- progressはsnapshot、original X/Y、backup生成、完了を表示する。

## 19. 未同期Outboxとbackup snapshot — 確定
- backupはserver canonicalではなく、export開始時のlocal Business viewを正本とする。
- 未同期CREATE/UPDATEもlocal Businessへ反映済みなら含め、localでdeleted扱いのentityはactive backupから除外する。
- sync成功をbackup開始条件にしない。
- Outbox/baseRevision/syncSeq/revision/cursor等は含めない。
- restore後はbackup由来sync stateを復元せず、採用Businessに必要なOutboxをrestore先で新規生成する。
- snapshotは同一IndexedDB read transactionまたは同等の一貫性境界で取得する。

## 20. backup/restore User所有権境界 — 確定

**確定（v0.8）:** backupは作成したUserに所属し、同一Userへのrestoreだけを許可する。

- `manifest.json`に必須field `ownerUserId`を保持する。
- `ownerUserId`はbackup作成時のauthenticated `User.id`をそのまま記録する安定identifierとする。
- `ownerUserId`は認証credential、session token、secretではなく、restore時のownership validationにのみ使用する。
- backupへpassword、session、TOTP secret、API token等の認証秘密情報は含めない。
- restore `PREPARING`でmanifest/checksum/schema検証後、Business stagingを有効化する前に、現在authenticated `User.id`と`ownerUserId`を完全一致比較する。
- 不一致なら`BACKUP_OWNER_MISMATCH`としてrestoreを拒否し、Business / SyncState / Outboxへ変更を加えない。
- owner mismatch backupを別User用に自動変換、ID/code再採番、ownerUserId書換えしてrestoreする処理は提供しない。
- 同一Userであれば別deviceへのrestoreを許可する。deviceId / DevicePrefix / LocalSequenceはrestore対象外なので、restore先device自身のnamespaceを維持する。
- account削除後に別Userとして作成されたaccountは、表示名/email等が同じでも`User.id`が異なる限り同一ownerとは扱わない。

### 将来のaccount間移行
別UserへBusinessを移す要求が生じた場合は、backup restoreへ例外を追加せず、import/transfer機能として別途設計する。その際に新identity生成、Box.code collision、photo ownership、server authorization、監査等を明示的に扱う。

### 根拠
backup restoreでBusiness identityを維持する設計と、server/localのUser namespaceを一致させるため。同一User限定にすればBox.id/code、写真blob ownership、sync identityを変更せず復元できる。認証秘密をbackupへ含めずUser.idだけでownershipを検証することで、backup file自体を認証手段にしない。

## 21. 次の設計判断候補

`ownerUserId`を含むbackup fileは平文ZIPなので、**backup内容の暗号化をv0.8で提供するか**を確定する必要がある。

背景:
- backupにはBox/Item/Location等のBusinessデータとoriginal写真が含まれ、ZIPを展開すれば内容を閲覧できる。
- `checksums.json`は破損検出用であり、機密性や改ざん真正性を提供しない。
- browser/PWAでpassword-based encryptionを実装すると、鍵導出parameter、password紛失、streaming ZIPとの組合せ、format versioning等の追加設計が必要になる。

推奨案（v0.8）:
- v0.8ではapplication-level backup暗号化を導入しない。
- `.hkmbackup`は「写真を含むため機密情報として扱う必要がある」ことを仕様/UIで明示する。
- OS/device/cloud storage側の暗号化・アクセス制御を利用者の保存先保護として利用する。
- 将来暗号化を追加する場合は、現在のZIP内部entryを個別に暗号化する場当たり的拡張ではなく、新しいbackup container/schema versionとして設計する。
- password-based encryptionを採用する場合はKDF、AEAD、salt/nonce、metadata露出範囲、password recovery不可のUXまで一体で仕様化する。

根拠: v0.8の目的は完全かつ復元可能なbackupの確立であり、暗号化を同時導入するとformat/streaming/復旧UXの複雑性が大きく増える。暗号化なしであることを明示し、後方互換を意識した新versionで追加できる余地を残す。
