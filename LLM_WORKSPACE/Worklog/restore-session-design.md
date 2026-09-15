# RestoreSession 設計判断記録

更新: 2026-09-15
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
- 各写真の保存原画像blob（既に確定済みのstored-original WebP bytes）
- restoreに必要なschema/version/manifest情報

backup対象外:
- `deviceId / DevicePrefix / LocalSequence`
- SyncState / Outbox / sync cursor / syncSeq / server revision等の同期内部状態
- RestoreSession / RestoreConflict / restore staging
- tombstone（通常backupはactive dataのみという既決方針を維持）

### 根拠
写真originalをbackupに含めない場合、server側blobが消失・取得不能な状況ではbackup単体から完全復元できず、backupとしての独立性が失われる。したがって通常backupはoriginalを含む。

## 9. RestoreSession stagingの写真保持 — 確定

restore開始時、Business/thumbnail系stagingとoriginal blob stagingを論理的に分離する。

### Business staging
保持するもの:
- backup Business snapshot
- `photoId / photoHash / thumbnail / order`
- RestoreConflictとresolution
- manifest/validationに必要な情報

通常Business / SyncState / Outboxとは別領域とし、RESOLVING中はcanonical dataとして表示・同期しない。

### Blob staging
- backupに含まれるoriginal blobはRestoreSession専用blob stagingへ保持する。
- restore開始時点で通常photo original cache/canonical領域へ無条件に複製しない。
- RESOLVING中はblob stagingを保持し、元backupファイルなしで再開可能にする。
- `USE_BACKUP`等の最終結果でcanonical Businessから参照される写真だけを適用対象とする。
- KEEP_EXISTINGや最終的に不要なbackup写真はcanonical領域へ導入しない。
- キャンセル時はblob stagingを削除可能。
- COMPLETED後はcanonical側に必要originalが存在することを確認してstagingをcleanupする。

### photoId / photoHash検証
- staging作成時にbackup manifestと写真entryを検証する。
- original bytesからphotoHashを再計算し、backup記録のphotoHashと一致しない写真はrestore errorとする。
- 同じphotoIdが現在canonicalに存在し同じphotoHashなら同一写真bytesとして扱える。
- 同じphotoIdで異なるphotoHashは既決の`PHOTO_ID_COLLISION`/identity不整合として自動上書きしない。

### 根拠
originalを通常cacheへ先に投入すると、キャンセルされたrestoreのblobが通常領域へ混入し、容量消費とGC判定を複雑化する。RestoreSession専用stagingならrestore確定前のデータを隔離でき、中断再開も保証できる。

## 10. staging容量不足 — 確定

- `PREPARING`でbackup manifestを先に検証し、Business/thumbnail/originalを含む必要staging容量を見積もる。
- `navigator.storage.estimate()`等で取得可能なquota/usageは事前警告・開始可否判断の参考値に使う。
- quota推定値だけを成功保証には使わず、**実際のIndexedDB staging write成功を正本**とする。
- Businessへ一切反映する前にstaging copyを完了する。
- quota不足、IndexedDB write failure、写真hash不一致等でPREPARINGに失敗した場合、作成途中stagingをcleanupする。
- PREPARING失敗では既存Business / SyncState / Outboxを変更しない。
- cleanup後、容量確保またはbackup修正後にrestoreを最初から再試行する。
- PREPARING途中の不完全stagingをRESOLVINGへ昇格させない。

### 根拠
ブラウザstorage quotaは実装・端末・空き容量等で変動し、estimate値だけでは書込成功を保証できない。一方、staging完了前にBusinessを変更しなければ容量不足でも既存データを安全に維持できる。

## 11. 現行実装との差異
現行`apps/web/src/lib/backup.ts`は`hakomokuroku-backup@1`のJSONでBox/Item中心、`photoThumbs`を扱い、original blobを含まず、BoxLocationも対象外である。現行mergeは`updatedAt`で勝者を選び、replaceではID再採番を行う。これらは確定設計と一致せず、仕様・テスト確定後の実装段階で置換対象とする。

## 12. 次の設計判断候補

自己完結backupの**ファイル形式**を確定する必要がある。original blobを含むため、巨大Base64をJSONへ埋め込む方式は避けるのが望ましい。

推奨案:
- backup containerをZIPとする。
- root `manifest.json`にschema version、exportedAt、counts、Businessデータ、photo metadata/file mappingを保持する。
- originalは`photos/<photoId>.webp`としてbinary格納する。
- thumbnailもbinary file化するかmanifest内表現にするかは次判断。
- container全体またはmanifest/entry hashで破損検出する。
- 拡張子は箱目録固有形式にする場合でも実体ZIPとし、将来version migrationを容易にする。

