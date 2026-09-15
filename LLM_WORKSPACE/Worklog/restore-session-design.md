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
- 各写真の保存原画像blob
- restoreに必要なschema/version/manifest情報

backup対象外:
- `deviceId / DevicePrefix / LocalSequence`
- SyncState / Outbox / sync cursor / syncSeq / server revision等の同期内部状態
- RestoreSession / RestoreConflict / restore staging
- tombstone

### 根拠
写真originalをbackupに含めない場合、server側blobが消失・取得不能な状況ではbackup単体から完全復元できず、backupとしての独立性が失われる。

## 9. RestoreSession stagingの写真保持 — 確定
restore開始時、Business/thumbnail系stagingとoriginal blob stagingを論理的に分離する。

- Business stagingはbackup Business snapshot、photo metadata、RestoreConflict/resolution、manifest検証情報を保持する。
- original blobはRestoreSession専用blob stagingへ保持する。
- restore開始時点で通常photo cache/canonical領域へ無条件に複製しない。
- RESOLVING中はblob stagingを保持し、元backupファイルなしで再開可能にする。
- 最終結果でcanonical Businessから参照される写真だけを適用対象とする。
- KEEP_EXISTING等で不要なbackup写真はcanonical領域へ導入しない。
- キャンセル時はblob stagingを削除可能。
- COMPLETED後はcanonical側に必要originalが存在することを確認してstagingをcleanupする。
- staging作成時にoriginal bytesからphotoHashを再計算しmanifest値と照合する。
- 同じphotoId + 同じphotoHashは同一写真bytesとして扱える。
- 同じphotoId + 異なるphotoHashはidentity不整合として自動上書きしない。

## 10. staging容量不足 — 確定
- `PREPARING`でbackup manifestを検証し必要staging容量を見積もる。
- `navigator.storage.estimate()`等のquota/usageは参考値。
- 最終判定は実際のIndexedDB staging write成功。
- Businessへ一切反映する前にstaging copyを完了する。
- quota不足/write failure/hash不一致等ならPREPARING失敗とし、途中stagingをcleanupする。
- 既存Business / SyncState / Outboxは変更しない。
- 不完全stagingをRESOLVINGへ昇格させない。

## 11. 現行実装との差異
現行`apps/web/src/lib/backup.ts`は`hakomokuroku-backup@1`のJSONでBox/Item中心、`photoThumbs`を扱い、original blobを含まず、BoxLocationも対象外である。現行mergeは`updatedAt`で勝者を選び、replaceではID再採番を行う。確定仕様・テスト完成後の実装段階で置換対象とする。

## 12. backup container形式 — 確定

**確定:** 自己完結backupはZIPをcontainer形式として使用する。JSONへのBase64埋め込みは使用しない。

基本構造:
```text
<backup container: ZIP>
├─ manifest.json
├─ photos/
│  └─ <photoId>.webp
└─ thumbnails/
   └─ <photoId>.webp   # thumbnail格納方式は次判断で最終確定
```

### manifest.json
rootの`manifest.json`をbackupの入口/目録とし、少なくとも次を持つ。
- backup schema identifier + version
- exportedAt
- counts
- Box / Item / BoxLocation等のactive Business snapshot
- photo metadata (`photoId`, `photoHash`, order, parentとの対応)
- binary entryへのpath mapping
- binary entryの検証情報

### original
- 保存原画像は`photos/<photoId>.webp`としてbinaryのまま格納する。
- Base64へ変換しない。
- `photoId`とmanifest mappingでBusinessから参照する。
- original bytesは既存の`photoHash`で整合性検証する。

### versioning
- containerの物理形式はZIPで固定し、論理schema versionをmanifestで管理する。
- restoreはmanifest schema/versionを先に検証してから他entryを採用する。
- 未対応の将来versionを推測して読み込まない。
- migration対応を追加する場合はversion単位で明示的に行う。
- 現行`hakomokuroku-backup@1` JSONは開発中旧形式であり、v0.8確定backupとのlegacy互換を必須にしない。旧開発データを破棄可能という既決方針に合わせる。

### ファイル拡張子
- 利用者向けには箱目録backupと識別できる固有拡張子を採用する方向とする。
- 実体は標準ZIPなので、診断・将来migration・toolingを容易にする。
- MIME typeや具体的拡張子文字列はbackup仕様確定時に固定する。

### integrity
- ZIP自体のCRCだけに完全性判断を依存しない。
- manifestに各binary entryの期待hashを持たせる。
- originalは`photoHash`と実bytesのSHA-256を照合する。
- manifest自体およびcontainer全体の追加hash/signature要否は別途判断する。
- 不一致entryがあればPREPARINGを失敗させBusinessへ反映しない。

### 根拠
写真originalをJSONへBase64埋め込みするとファイルサイズ増加、巨大JSON parse時のmemory負荷、binary検証/stream処理の複雑化が生じる。ZIP内にbinaryを独立entryとして保持すれば、自己完結性を維持しながらmanifestと大容量binaryを分離できる。また論理schemaをmanifestで管理することで、container形式を変えず将来migrationを追加できる。

## 13. 次の設計判断候補

thumbnailのbackup格納方式を確定する必要がある。

推奨案:
- thumbnailも`thumbnails/<photoId>.webp`としてbinary entry化する。
- manifestにはthumbnail path + thumbnail hash/sizeを保持する。
- thumbnail bytesをJSON/Base64へ埋め込まない。
- restore PREPARINGでthumbnail hashを検証する。
- originalとは独立したthumbnail hashをbackup integrity用に持つ（これはparent business contentHashではない）。
- これによりmanifestを小さく保ち、original/thumbnailとも同じbinary entry検証方式を利用できる。
