# RestoreSession 設計判断記録

更新: 2026-09-17
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
- backupは作成したUserに所属し、同一Userへのrestoreだけを許可する。
- manifest必須field `ownerUserId`にbackup作成時のauthenticated `User.id`を保持する。
- restore PREPARINGでcurrent User.idと完全一致比較し、不一致は`BACKUP_OWNER_MISMATCH`として適用前に拒否する。
- 認証credential/secretはbackupへ含めない。
- 同一Userなら別deviceへrestore可能。device namespaceはrestoreしない。
- account間移行は将来別のimport/transfer機能として設計する。

## 21. backup暗号化 — 確定
- v0.8ではapplication-level backup暗号化を導入しない。
- `.hkmbackup`は写真やBusiness内容を含む暗号化されていないZIP containerであることをUI/仕様で明示する。
- checksumsは破損検出用で機密性/真正性を保証しない。
- 保存先保護はOS/device/cloud storage側へ委ねる。
- 将来暗号化する場合は新backup container/schema versionとしてKDF/AEAD/UXを含めて設計する。

## 22. backup保持世代・自動backup — 確定
- v0.8はmanual exportのみ。自動backup/世代管理/rotationは導入しない。
- 保存済みfile一覧/path/世代数を箱目録canonical stateとして管理しない。
- `lastBackupExportAt`はlocal preferenceの参考表示としてのみ保持可能で、file存在保証には使わない。

## 23. 写真0枚backupのcontainer構造 — 確定
- 写真0枚でも同じ`.hkmbackup` ZIP、manifest schema、validation pipelineを使用する。
- photo count=0、photo metadata=`[]`。
- directory entryは任意でchecksums対象外。
- 写真0枚なのにphoto binary logical entryがある場合はinvalid。

## 24. Business 0件の完全空backup — 確定

**確定:** authenticated Userのactive Business entityが0件でも、正常なmanual backupとして`.hkmbackup`を生成できる。

- Box / Item / BoxLocation / photo等、v0.8 manifestで定義する各Business collectionを空配列`[]`とする。
- 各対応countは`0`とする。collection fieldやcount fieldを省略して空を表現しない。
- `ownerUserId`、`exportedAt`、backup schema identifier/version、`checksums.json`等の非Business必須情報は通常backupと同じく保持・検証する。
- 写真0枚規則も通常どおり適用する。
- export UIはBusiness 0件をerrorとして拒否しない。必要なら「保存対象データ0件」を情報表示してよいが、生成自体は可能とする。

### restore semantics
- restoreはsnapshot全置換ではなく、backupに存在するidentityを対象としたmerge/競合解決である。
- **backupに存在しないentityは、restore先で削除・変更しない。**
- よって完全空backupをBusinessあり環境へrestoreしても、既存Businessを全削除しない。
- backup 0件 + restore先0件ならBusiness変更なしで正常完了する。
- backup 0件 + restore先BusinessありでもBusiness変更なしで正常完了する。
- backupに存在しないことをDELETE指示として解釈しない。
- backupはactive dataのみでtombstoneを含めないため、backup単独から過去の削除を再現しない。

### restore result
- 実適用対象が0件で競合もない場合もRestoreSessionは正常に完了できる。
- Business / Outboxに不要なwriteを発生させない。
- restoreの実行記録/UIは「0件復元」等、何も変更しなかったことが判別できる表示をしてよい。

### 根拠
backupの欠落entityをDELETEと解釈すると、active-only backupとtombstone除外方針に反し、古いbackupをrestoreしただけで現在の追加データを失う危険がある。identity単位mergeに統一することで、空backupを含め安全な加算/更新型restoreとして扱える。

## 25. 次の設計判断候補

restoreで**backupにだけ存在するBusiness entityを利用者確認なしで追加するか**を確定する必要がある。

背景:
- 同一identityの内容差異は`KEEP_EXISTING / USE_BACKUP`で利用者判断する方針が確定済み。
- 一方、backupにだけ存在しrestore先に同一identityがないentityは内容競合ではない。
- 全新規entityまで1件ずつ確認すると、大規模backupのrestore操作量が非常に増える。

推奨案:
- backupにだけ存在し、identity/参照/Box.code/photo等のvalidation conflictがないBusiness entityは**自動追加**する。
- 単なる「restore先に存在しない」はRestoreConflictを作らない。
- 追加前にowner、schema、参照整合、Box.code unique、photo identity/hash等をPREPARING/RESOLVINGで検証する。
- identity/code/photo collision等、既確定の不整合条件がある場合のみ利用者判断またはreject対象とする。
- APPLYINGで自動追加entityも他のUSE_BACKUP適用と同じtransactionに含め、必要なOutboxを生成する。
- UIでは適用前summaryに「新規追加 N件」を表示し、個別競合判断とは分離する。

根拠: 新規entityはexisting contentを上書きしないため通常のcontent conflictではない。安全性に関わるidentity/reference validationを先に行い、競合のない追加は自動化する方がrestore UXと大規模backup処理の両方を単純化できる。
