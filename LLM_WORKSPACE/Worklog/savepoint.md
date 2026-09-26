# 箱目録 作業 SavePoint

更新: 2026-09-26
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`

## 1. 作業目的
箱目録を完成させる。HLDocS v0.7.0は作業管理・仕様整理に利用するが、その未完成・不整合をブロッカーにしない。

作業順:
要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証。

現在は**設計段階**。アプリケーションコードはまだ変更しない。

## 2. 現在位置
**v0.8全体設計の残件棚卸し・文書整理中。**

設計完了管理の正本:
- `LLM_WORKSPACE/Worklog/design-completion-checklist-v0.8.md`

主要作業記録:
- `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`
- `LLM_WORKSPACE/Worklog/box-code-investigation.md`
- `LLM_WORKSPACE/Worklog/restore-merge-decision.md`
- `LLM_WORKSPACE/Worklog/restore-session-design.md`

## 3. 主要確定事項

### Release / Business
- v0.8 = Vision以外の完成版。
- v1.0 = v0.8 + Vision/LLM画像認識。
- 登録順 = Box → Items → Box photo → Label → Location。
- QR payload = canonical `Box.code`そのもの。
- Item取り出し = `boxId=UNASSIGNED`。
- delete = tombstone。
- Box delete → child ItemsをUNASSIGNED。
- BoxLocation delete → child BoxesをUNASSIGNED。
- BoxLocationはUser scoped flat independent master。

### Sync
- business identity = `(User.id, entityId)`。
- local DB = `hk-local-v2-<User.id>`。
- server metadata = `createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`。
- revision mismatch + same contentHash = UNCHANGED、different = CONFLICT。
- SyncChangeLogがPull差分正本、syncSeqはDB-wide monotonic signed 64-bit。
- local = Business / SyncState / Outbox。
- local Business update + Outboxは同一IndexedDB transaction。
- normal sync = Pull → Outbox reapply → Push → Pull。
- tombstone server retention 30日、SyncChangeLog 90日。
- Full Resync = fixed snapshotSeq + paging + staging + Outbox reapply。
- Outbox reapply order = BoxLocation → Box → Item。

### Box.code / Device
- `BX-<DevicePrefix 4><LocalSequence 4>`。
- alphabet = `ABCDEFGHJKMNPQRSTUVWXYZ23456789`。
- Box.code immutable。
- DevicePrefixはserver割当・User scope unique。
- LocalSequenceはdevice-local `0..923520`。
- Box + Outbox + counter incrementは同一local transaction。
- sequence枯渇時は同deviceIdへnew prefix。
- device registration : prefix allocation = 1:N。
- old prefixは永久予約。
- additional allocation = `deviceId + expectedActivePrefix`。
- device stateは通常backup対象外。

### Photo
- no dedup、photoId独立identity。
- Photoは親Business entityのphotos配列要素で独立sync entityではない。
- 1 photoId = exactly 1 Business parent。
- parentごと0〜10枚、順序はbusiness-significant。
- original = WebP long-edge 1600px q0.85 max 5MiB。
- thumbnail = WebP long-edge 400px q0.8 max 256KiB。
- photoHash = stored original bytes hash。
- blob-first upload。
- unreferenced blobは30日後GC候補。

### Restore — 現行簡略化方針
旧persistent RestoreSession中心設計は撤回済み。現行方針:
- Restoreはonline foreground operation。
- Restore開始時にserver User-scope Restore lockを取得。
- Restore owner以外はlock中Business Pull / Push / Business関連blob uploadをretryable `RESTORE_LOCKED`として待機。
- 他端末のlocal閲覧・編集は継続しOutboxへ蓄積。
- unlock後は通常sync/conflictへ戻す。
- 長期中断・後日再開なし。
- RestoreHistoryなし。
- persistent RestoreConflictなし。resolutionはoperation memory上。
- backup全量binary stagingなし。選択backupをoperation sourceとして直接利用。
- 必要photoだけBusiness commit前にcanonical storageへpre-promote。
- client durable stateは最小 `RestoreApplyMarker = applyId + promotedPhotoIds[] + appliedAt`。
- serverはRestore Jobを持たず、`applyId` idempotency + short-lived `RestoreApplyResult(COMMITTED)`。
- Restore lockはshort lease + simple renewal。handoff/reacquireなし。
- client crash時はmarker、server result、lease expiryから安全に収束。
- Restore専用storage accounting/recountなし。

詳細判断履歴は現時点では `restore-session-design.md` section 91〜104を優先する。旧sectionと矛盾する場合、後の簡略化sectionを現行仕様とする。次の文書整理で旧記述を除去する。

## 4. 重要な文書不整合
整理対象:
- `restore-session-design.md` section 1〜90には撤回済みRestoreSession/History/Conflict/staging等が残る。
- `requirements-v0.8-v1.0.md` section 16の「ID conflict時にnew ID発行」は現在のRestore方針と不整合。特にBoxはcode immutable/identity validation方針を優先する。
- 旧SavePointのsection 82/83再開指示は撤回済み。
- `restore-merge-decision.md`は初期判断記録として残るが、現行Restore全体仕様の正本にはしない。

## 5. 現行実装との差異
主な未実装/要置換:
- Prisma sync metadata / composite User identity。
- revision/contentHash/Outbox/SyncState/SyncConflict/SyncChangeLog/Full Resync。
- canonicalization。
- IndexedDB `hk-local-v2-<User.id>`。
- BoxLocation確定model。
- Box.code / DevicePrefix確定方式。
- Restore lock / minimal RestoreApplyMarker / idempotent RestoreApplyResult。
- photoId + Blob-separated sync/server validation/cache。
- QR payload現行`/b/<code>`からBox.codeのみへ変更。
- backup schema/photo field/BoxLocation/ZIP self-contained形式。

## 6. ロードマップ
0. 現状棚卸し — 完了
1. v0.8/v1.0要件主要方針 — 完了
2. 全体アーキテクチャ — 最終整理中
3. Data Model / Sync詳細設計 — 残件あり
4. Box / Item / Photo / BoxLocation詳細設計 — 残件あり
5. QR / Search / Label設計 — 残件あり
6. Backup / Restore / PWA設計 — Restore整理中、PWA等残件あり
7. 設計完了利用者確認
8. feature test cases
9. test code
10. implementation
11. v0.8 verification / acceptance
12. Vision/LLM requirements/design/tests/implementation
13. v1.0 verification / acceptance

## 7. 次のアクション
1. `restore-session-design.md`を現行仕様だけのcanonical文書へ再構成。
2. `requirements-v0.8-v1.0.md`の旧Restore/ID conflict記述を現行方針へ整理。
3. `design-completion-checklist-v0.8.md`を上から処理し、未決事項を1件ずつ確定。
4. Restoreの残る実質判断「local/server apply順序」を確定。
5. Data Model / Sync詳細へ戻る。

## 8. HLDocS運用
HLDocS v0.7.0は再構成中。HLDocS側不整合は箱目録のblockerにしない。必要ならfeedback候補として記録し、箱目録の要件→設計→test→implementation順序を優先する。
