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
**確定:** 通常backupは、serverや元端末へ依存せず復元できる自己完結型とし、Businessデータ、thumbnail、保存原画像(original blob)を含める。

backup対象:
- Box / Item / BoxLocation等のactive Businessデータ
- 各写真の`photoId / photoHash / thumbnail / array order`
- 各写真の保存原画像blob
- restoreに必要なschema/version/manifest情報

backup対象外:
- `deviceId / DevicePrefix / LocalSequence`
- SyncState / Outbox / sync cursor / syncSeq / server revision等の同期内部状態
- RestoreSession / RestoreConflict / restore staging
- tombstone

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
**確定:** 自己完結backupはZIPをcontainer形式として使用する。JSONへのBase64埋め込みは使用しない。

```text
<backup container: ZIP>
├─ manifest.json
├─ checksums.json
├─ photos/
│  └─ <photoId>.webp
└─ thumbnails/
   └─ <photoId>.webp
```

- root `manifest.json`をbackupの入口/目録とする。
- container物理形式はZIP、論理schema versionはmanifestで管理する。
- 保存原画像は`photos/<photoId>.webp`。
- 現行`hakomokuroku-backup@1` JSONとのlegacy互換は必須にしない。

## 13. thumbnail backup entry — 確定
- path=`thumbnails/<photoId>.webp`。
- manifestに`thumbnailPath`, `thumbnailHash`, `thumbnailSize`を保持する。
- `thumbnailHash`はthumbnail bytesのSHA-256でbackup integrity専用、parent Business `contentHash`には含めない。
- 欠落・hash不一致・size不一致ならPREPARING失敗。originalから暗黙再生成しない。

## 14. backup container integrity — 確定
- v0.8は破損検出を目的とし暗号署名/MACは導入しない。
- ZIP rootに`checksums.json`を置き、`manifest.json`を含む全論理entryをSHA-256で列挙する。
- `checksums.json`自身はhash対象外。
- PREPARINGでZIP path安全性、重複entry、必須entry、checksums schema、全entry hash、manifest schema/business/photo mappingを検証する。
- v0.8 schemaで許可されない余分なfile entryは拒否する。
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
- `application/vnd.hakomokuroku.backup+zip`は箱目録が使用するvendor-tree形式のMedia Type名であり、v0.8時点でIANA正式登録済みであることを意味しない。正式登録の有無はIANA registry上の登録状態で決まる。

### 根拠
固有拡張子により利用者がbackupを識別しやすくしつつ、restore correctnessをOS/browserのMIME判定やfilenameへ依存させない。`vnd.`はvendor treeを示す名称要素であり、文字列自体はIANA登録済みの証明ではない。

## 16. backup export時のoriginal収集 — 確定

**確定:** 自己完結backupを作成するため、export開始時snapshotが参照する全original写真を収集・検証できた場合のみbackupを完成させる。

- export開始時にactive Business snapshotを固定する。
- snapshotから必要な全`photoId / photoHash`を列挙する。
- local original cacheに対象blobがある場合も、実bytesのSHA-256を計算し`photoHash`と一致したものだけ使用する。
- localに無い、またはlocal blobがhash不一致の場合は、認証済みserver original APIから同じ`photoId / photoHash`のoriginalを取得する。
- server取得blobも実bytesのSHA-256を計算し`photoHash`と一致した場合のみ採用する。
- 全originalが揃い、hash検証が完了するまでZIPを完成backupとして利用者へ出力しない。
- offlineかつlocalに不足originalがある場合はexportを停止し、不足写真件数を利用者へ表示する。
- server側でもoriginalが存在しない、取得不能、またはhash不一致の場合はexport失敗とし、不完全backupを生成しない。
- export途中に通常Business編集が発生しても、当該exportの対象は開始時snapshotに固定し、途中で対象entity/photo集合を変更しない。
- export開始後に追加されたBusiness/写真は次回backup対象となる。
- export開始後に削除・変更された写真でも、snapshotが参照するoriginalをlocal/serverから取得できる限り当該backupへ含める。

### snapshot consistency
- Business snapshot取得時点の各entity business contentとphoto reference/orderをbackup正本とする。
- original取得はsnapshotに記録された`photoId / photoHash`に対して行い、取得時点の最新Businessを再読込して差し替えない。
- これにより長時間export中の通常操作を禁止せず、一貫した時点のbackupを作成する。

### 根拠
local original cacheは容量管理によりevict可能なので、local cacheだけをbackup sourceにすると自己完結backupを保証できない。serverを補完sourceとして利用し、開始時Business snapshotとphotoHashを固定することで、export中の編集と写真取得を分離しつつ一貫したbackupを作れる。不足写真を黙って省略するとbackupの完全性要件を破るため、不完全backupは生成しない。

## 17. 次の設計判断候補

backup生成のためserverから取得したoriginalを**通常local original cacheへ残すか**を確定する必要がある。

推奨案:
- backup export専用の一時領域/streamとして扱い、backup成功だけを理由に通常local cacheへ永続追加しない。
- すでに通常cacheに存在するoriginalはそのまま利用する。
- serverからbackup目的で取得したoriginalはZIP生成完了まで保持し、成功/失敗/キャンセル後に一時領域を解放する。
- 通常cacheへの保存は既存の閲覧/明示download等のcache policyに従い、backup処理から副作用として変更しない。
- 根拠: 大規模backup直後に全originalをcacheへ残すとquotaを圧迫し、既存のeviction policyを逆行させるため。
