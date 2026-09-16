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

**確定:** backup生成だけを理由としてserverから取得したoriginalを通常local original cacheへ永続追加しない。

- backup export専用の一時データとして扱う。
- すでに通常local cacheに存在しhash検証済みのoriginalは、そのcache entryをsourceとして利用する。
- serverからbackup目的で取得したoriginalはZIP生成に必要な期間だけ保持する。
- backup成功、失敗、利用者キャンセルのいずれでもbackup専用一時データを解放する。
- backup処理は通常local original cacheのLRU/最終利用時刻等を、単なるbackup source利用を理由に更新しない。
- backup中に別の通常閲覧処理が同じoriginalをcacheへ保存した場合、その通常cache entryはbackup cleanup対象にしない。
- 通常cacheへの永続保存は閲覧、明示download等の通常cache policyにのみ従う。
- backup一時データと通常cache entryを所有権/用途上区別し、cleanupで通常cacheを誤削除しない。

### 実装方針
- 可能ならserver responseをZIP writerへ逐次渡し、全originalをIndexedDBへ一時永続化しない。
- 使用するZIP実装/APIの制約でstreamingが困難な場合のみ、backup専用temporary storageを利用する。
- temporary storageを使う場合も通常photo cacheとは別namespace/storeとし、終了時cleanup可能にする。
- browser/PWAが中断された場合に残ったtemporary backup dataは、次回起動時にactive export処理が存在しないことを確認してcleanupする。

### 根拠
backupは全originalを扱うため、取得した全blobを通常cacheへ残すとbackupサイズ相当の容量を恒常的に消費し、既存のeviction policyと競合する。またbackupという保全処理が閲覧cacheの利用頻度を人工的に更新すると、本当に最近閲覧した写真が先にevictされる可能性がある。backup sourceと通常cacheを分離することでbackup correctnessとcache policyを独立させる。

## 18. 次の設計判断候補

backup export処理そのものの**中断・再開を提供するか**を確定する必要がある。

背景:
- 写真が多い場合、serverから多数のoriginalを取得するためexportが長時間になる可能性がある。
- iOS/PWA/browserではbackground suspensionやpage terminationがあり得る。
- restoreはpersistent RestoreSessionで中断再開可能と確定済みだが、exportについてはまだ未確定。

推奨案（v0.8）:
- exportは中断再開可能な永続jobにはしない。
- 1回のforeground operationとして実行する。
- 利用者キャンセルは許可し、一時データをcleanupする。
- page終了/browser suspension等で中断された場合はそのexportを失敗扱いとし、次回は開始時から再実行する。
- 未完成`.hkmbackup`を利用者へ保存しない。
- progressは`Business snapshot完了 / original X/Y取得・検証 / ZIP生成 / 完了`程度を表示する。
- 根拠: exportはBusinessを変更しないread-only処理であり、再実行しても業務データ副作用がない。persistent resumable jobを導入するとsnapshot、取得済みblob、ZIP部分生成、quota cleanupの状態管理が大幅に複雑化するため、まずv0.8では完全backup correctnessを優先する。
