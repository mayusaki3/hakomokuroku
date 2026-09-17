# RestoreSession 設計判断記録

更新: 2026-09-18
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
- authenticated Userのactive Businessが0件でも正常なmanual backupを生成する。
- 各Business collection=[]、count=0。非Business必須metadataは通常どおり保持する。
- restoreはidentity単位mergeであり、backupに存在しないexisting entityを削除・変更しない。
- 空backup restoreはBusiness変更なしで正常完了可能。

## 25. backupにだけ存在するBusiness entity — 確定
- backupに存在しrestore先に同一identityがないBusiness entityは、整合性validation通過後に個別確認なしで自動追加する。
- 単なるidentity不存在はRestoreConflictにしない。
- 自動追加対象はstagingに保持し、APPLYING transactionで他のrestore変更とまとめて反映する。
- 通常local CREATEとしてcontentHashとOutbox CREATEをrestore先で生成する。
- identity/code/photo等の不整合は既定の利用者判断またはrejectへ回す。

## 26. restore適用前の最終summary確認 — 確定
- RESOLVING完了後、APPLYING直前の利用者summary確認を必須にする。
- 新規追加/backup採用更新/現在値維持/UNCHANGED/stale等をentity type別に表示する。
- stale/未解決conflictがあれば実行不可。
- 利用者の明示的な「復元を実行」操作だけでAPPLYINGへ進む。
- summary後のBusiness変更に備え、実行時にもstale再検証する。

## 27. restore完了とserver syncの境界 — 確定
- restoreの成功・`COMPLETED`成立条件はlocal atomic commitの成功とし、server sync成功をrestore完了条件に含めない。
- restore機能から専用の即時syncをtriggerしない。
- restoreで生成されたOutboxは通常sync schedulerへ渡す。
- offline中でもrestoreを完了できる。
- UIでは「復元完了」とsync状態を分離する。
- 後発sync conflictは通常sync conflictとして扱い、過去RestoreSessionをFAILEDへ戻さない。

## 28. restore完了後の履歴 — 確定

**確定:** v0.8では、完了・キャンセル・終了可能な失敗sessionの重いRestoreSession dataをcleanupし、代わりに軽量なlocal-only `RestoreHistory` summaryを直近20件まで保持する。

```text
RestoreHistory
- id
- restoreSessionId
- startedAt
- finishedAt
- backupExportedAt?
- result
- addedCount
- updatedCount
- keptCount
- unchangedCount
- conflictCount
- errorCategory?
```

- `RestoreHistory.id`はlocal history record identity、`restoreSessionId`は元sessionとの診断上の対応用とする。
- `result`は少なくとも`COMPLETED / CANCELLED / FAILED`を区別する。
- `finishedAt`はCOMPLETEDなら完了時、CANCELLEDなら取消時、FAILEDなら終了確定時を保持する。
- COMPLETEDでは最終summary/適用結果から件数を確定して履歴へ保存する。
- CANCELLED/FAILEDでは未適用のstaging内容を「復元済み件数」として記録しない。必要な診断件数がある場合もresultと区別可能な情報として扱う。
- `errorCategory`はFAILED時の必要最小限の分類のみとし、backup内容・例外stack・credential等の詳細を保存しない。
- backup Business snapshot、existing/backup conflict snapshot、original photo blob、thumbnail blob、RestoreConflict詳細、Outbox、SyncState、server revision等はRestoreHistoryへ保持しない。
- 履歴はcanonical Businessではなく、sync対象でもbackup対象でもない。
- User別local DB内に保持するため`ownerUserId`は重複保持しない。
- 最大20件。21件目を追加するときは`finishedAt`が古い履歴から削除する。同時刻の場合は安定したidentity順で削除対象を決める。
- 利用者による履歴全消去を許可する。履歴消去はBusiness、Outbox、SyncState、backup fileへ影響しない。
- active/retryable RestoreSessionは履歴化して削除しない。再開に必要なsession/staging/conflictを保持する。
- COMPLETED後はRestoreHistory作成を先に行い、その後に重いstaging/blob/conflictをidempotent cleanupする。cleanup失敗はrestore失敗へ戻さず、次回startup等で再試行する。
- CANCELLEDおよびnon-retryable FAILEDも、Businessが適用されていないことを確認してから履歴化し、重いsession dataをcleanupする。

### 根拠
再開に必要なRestoreSession dataはactive中だけ保持すればよく、完了後まで写真blobやBusiness snapshotを残すとlocal storageを不必要に消費する。一方、軽量summaryを直近20件残せば「いつ復元したか」「何件変更されたか」「失敗/取消だったか」を利用者と開発者が確認でき、storage負荷とprivacy残留を小さく保てる。

## 29. 次の設計判断候補

**RestoreHistoryにbackup file名を保存・表示するか**を確定する必要がある。

背景:
- 利用者が複数の`.hkmbackup`を持っている場合、「どのbackupを復元したか」を履歴から判別できると有用。
- 一方、file名は利用者が自由に変更でき、backup identityでも真正性情報でもない。
- file名に利用者自身が個人情報や任意文字列を含める可能性があるため、診断履歴への長期保存は必要最小限にしたい。

推奨案:
- `RestoreHistory`には**選択時のbackup file名を保存しない**。
- 履歴の識別には`backupExportedAt`と、必要なら`backupHash`の短い表示用fingerprintを使用する。
- fingerprintはbackup container bytesのSHA-256から先頭12 hex程度を表示用に派生し、完全hashはRestoreSession内部の検証/対応用として必要な期間だけ保持する。
- fingerprintは真正性保証ではなく「同じbackup fileかを見分ける目印」と明示する。
- restore開始/summary画面では現在選択したfile名を一時表示してよいが、履歴には残さない。

根拠: file名は可変でidentityとして弱く、任意の個人情報を含み得る。backup生成時刻とcontent由来fingerprintの方が履歴識別として安定し、保存情報も限定できる。
