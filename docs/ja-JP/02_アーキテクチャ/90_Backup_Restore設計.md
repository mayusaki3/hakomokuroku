[目次](../README.md) > アーキテクチャ > Backup / Restore設計

# Backup / Restore設計

## 1. Backup
v0.8はmanual foreground exportのみ。self-contained `.hkmbackup` ZIPを生成する。

```text
manifest.json
checksums.json
photos/<photoId>.webp
thumbnails/<photoId>.webp
```

Business snapshotはexport開始時のlocal Business view。未同期Businessも含めるが、SyncState/Outbox/device namespace/restore temporary stateは含めない。

backupは同一UserへのRestoreのみ許可する。application-level encryptionはv0.8対象外。

## 2. Integrity
manifest/schema/path safety/duplicate entry/checksum/entity reference/photo referenceを検証する。checksumsは破損検出用で真正性保証ではない。

## 3. Restore operation
Restoreはonlineの単一operation。
- operation開始時にserver User-scoped Restore lockを取得
- long-term pause/resumeなし
- RestoreHistoryなし
- persistent RestoreConflictなし
- full backup binary stagingなし
- backup fileをoperation sourceとして直接読む
- conflict resolutionはmemory上
- same business content = UNCHANGED
- differing content = KEEP_EXISTING / USE_BACKUP
- currentにidentity無し = validation後auto-add candidate

## 4. Restore lock
short lease + opaque `lockToken`。operation中のみrenewする。handoff/reacquire/resolution reuseは行わない。

owner以外のBusiness Sync/blob uploadは `RESTORE_LOCKED`。local編集は可能。

lock ownership/leaseをpre-applyで失った場合はabortしresolutionを破棄する。

## 5. Binary
backup採用/new entityで必要なphoto binaryだけをapply直前に検証・準備する。必要binaryが揃わない状態でBusiness commitしない。

## 6. Idempotency
server Restore applyはclient-generated unique `applyId` を使う。同一User+applyIdを二重Business applyしない。

server atomic transactionにはRestore Business changes、canonical metadata、SyncChangeLog、short-lived `RestoreApplyResult(COMMITTED)` を含める。persistent Restore Jobは持たない。

response loss時はapplyIdでresultを照会する。

## 7. Client crash safety
現時点の確定案ではminimal durable marker:
```text
RestoreApplyMarker
- applyId
- promotedPhotoIds[]
- appliedAt
```

`appliedAt` はlocal Business/Outbox commit境界だけを表し、conflict ordering等には使わない。

## 8. 設計残件
**Restoreの主要残件はlocal/server applyの正確な順序。**
これを確定するまでsection 7のmarker構成も最終確定とはみなさない。

その他:
- lock lease / renew具体値
- RestoreApplyResult retention
- Restore owner photo uploadとserver Business commit境界
- Restore UI flow

旧persistent RestoreSession / RestoreHistory / persistent RestoreConflict / full binary staging / restore storage accounting / long-term resume設計は撤回済みで、現行仕様ではない。

[目次](../README.md) > アーキテクチャ > Backup / Restore設計
