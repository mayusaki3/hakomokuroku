# Backup / Restore 設計判断記録

更新: 2026-09-27
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`
状態: 判断履歴サマリー（非正本）

## 1. 正本
現行Backup / Restore仕様の正本は以下。

`docs/ja-JP/02_アーキテクチャ/90_Backup_Restore設計.md`

本ファイルは設計検討の経緯と撤回事項を示すWorklogであり、正本仕様として参照しない。
過去section 1〜104の詳細な検討履歴はGit historyから参照する。

## 2. 設計簡略化の結論
Restoreは当初、persistent RestoreSession、persistent RestoreConflict、full binary staging、長期中断再開、RestoreHistory、restore専用storage accountingを持つ設計として検討した。

再評価の結果、少ない利点に対してworkflow/state管理が過大だったため、v0.8では以下へ簡略化した。

- Restoreはonlineの単一operation。
- operation開始時にserver User-scoped Restore lockを取得。
- conflict resolutionはoperation memory上だけに保持。
- long-term pause/resumeを提供しない。
- backup fileをoperation sourceとして直接利用。
- full backup binary stagingを行わない。
- RestoreHistoryを持たない。
- persistent RestoreConflictを持たない。
- persistent Restore Job/state machineをserverに持たない。
- restore専用storage usage/recount/generation管理を持たない。
- server applyはclient-generated `applyId` でidempotentにする。

## 3. Restore lock
確定方針:
- User scopeで1つ。
- opaque `lockToken` + short lease。
- Restore operation中のみrenew。
- owner以外のBusiness Pull / Push / Business関連blob uploadをretryable `RESTORE_LOCKED`としてpause。
- 他端末のlocal閲覧・Business編集は継続可能でOutboxへ保持。
- unlock後は通常 `Pull → Outbox reapply → Push → Pull` へ戻す。
- pre-applyでlease/ownershipを失った場合はabortし、memory上のresolutionを再利用しない。
- handoff / transparent reacquire /別session continuationは行わない。

## 4. Conflict
- same identity + same business content = UNCHANGED。
- same identity + different business content = KEEP_EXISTING / USE_BACKUPを利用者が選択。
- currentにidentityが無いentity = validation後auto-add candidate。
- updatedAtでwinnerを決めない。
- Restore lock取得後に比較・resolutionするため、旧persistent stale conflict protocolは不要。
- Box.code immutable/integrity validationは通常Data Modelの不変条件を優先する。

## 5. Binary
- backup全量をIndexedDB stagingへ複製しない。
- backup採用/new entityに必要なphoto binaryだけapply前に検証・準備する。
- 必要binaryが揃わない状態でBusinessをcommitしない。
- server側のuncommitted uploadは通常orphan GCで回収する。

## 6. Server apply
- client-generated unique `applyId`。
- same User + applyIdをBusinessへ二重適用しない。
- server atomic transactionにRestore Business changes、canonical metadata、SyncChangeLog、short-lived `RestoreApplyResult(COMMITTED)`を含める。
- transaction abortならBusiness/resultともcommitしない。
- response loss時はapplyIdでresultを照会する。
- persistent PROCESSING/progress Restore Jobは作らない。

## 7. Client apply marker / server-first — 確定
Restore applyはserver-firstとする。

順序:
`lock → validate/resolve → required blob upload → applyId marker → server atomic apply → COMMITTED確認 → local Pull/adopt → marker cleanup → unlock`

client marker:
```text
RestoreApplyMarker
- applyId
```

Restore専用local Business/Outbox commitは行わない。
旧markerの `promotedPhotoIds[]` / `appliedAt` は不要。
local pre-promotionもcorrectness要件から外す。

server response loss/crash時はapplyIdでRestoreApplyResultを照会する。
COMMITTEDならPull/adopt、resultなしならlocal BusinessはRestore未適用なのでcleanupして終了する。

## 8. 明示的に撤回した旧設計
v0.8現行仕様では採用しない:
- persistent RestoreSession state machine
- PREPARING / RESOLVING / APPLYING / COMPLETED / CANCELLED / ERRORのdurable workflow state
- persistent RestoreConflict
- conflict resolutionの長期保存
- startup時の「Restoreを再開」UX
- full backup binary staging
- RestoreHistory
- same-backup history warning
- restore stagingBytes / promotedBytes usage表示
- recount / background recount / storageGeneration
- Restore専用の長期storage protection workflow

これらを復活させる場合は新しい設計判断として再検討する。

## 9. 現在の設計残件
1. Restore lock lease/renew具体値。
2. RestoreApplyResult retention。
3. Restore UI flow。

local/server apply順序とowner photo upload境界はserver-first採用により確定した。

## 10. 履歴
このファイルは以前section 1〜104までの詳細な逐次判断を保持していた。
文書整理により現行判断だけをsummary化した。旧内容はGit historyに保持されているため、必要な場合のみ履歴から参照する。
