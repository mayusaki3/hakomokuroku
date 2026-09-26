# 箱目録 v0.8 設計完了チェックリスト

更新: 2026-09-26
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`
状態: 設計フェーズ管理

## 1. 目的
v0.8の設計完了条件を有限のチェックリストとして管理する。
本チェックリストが完了し利用者確認を通過するまで、アプリケーション実装変更へ進まない。

状態:
- [x] 方針確定
- [ ] 設計残件
- [-] v0.8対象外

## 2. 全体要件・アーキテクチャ
- [x] v0.8 = Vision以外の完成版、v1.0 = v0.8 + Vision/LLM
- [x] 標準登録フロー: Box → Items → Box photo → Label → Location
- [x] User単位の完全データ分離
- [x] offline-first local Business + Outbox方針
- [ ] 現行設計を正式docsへ配置する際の文書構成/正本を確定
- [ ] v0.8画面遷移と各操作の保存境界を最終確認

## 3. Data Model
- [x] Box / Item / BoxLocationの基本関係
- [x] reserved `UNASSIGNED` Box / BoxLocation
- [x] server sync metadata方針
- [x] business identity = `(User.id, entityId)`
- [x] contentHash canonicalization基本規則
- [ ] Box / Item / BoxLocation / Outbox / SyncState / SyncConflict / SyncChangeLogの最終field schema
- [ ] server DB unique/index/FK/transaction制約
- [ ] local IndexedDB schema/version/migration方針
- [ ] RestoreApplyMarker / RestoreApplyResult / RestoreLockの最小schema

## 4. 通常Sync / Conflict / Full Resync
- [x] 通常sync = Pull → Outbox reapply → Push → Pull
- [x] revision + contentHash conflict方式
- [x] SyncChangeLog + global syncSeq
- [x] tombstone 30日 / SyncChangeLog 90日
- [x] Full Resync snapshotSeq + staging + Outbox再適用
- [x] Outbox reapply順 = BoxLocation → Box → Item
- [ ] Push/Pull API request/response/error code詳細
- [ ] blob uploadを含む通常syncの正確な順序
- [ ] SyncConflict解決API/UIの最終仕様
- [ ] Full Resync paging/staging採用境界の最終schema
- [ ] Restore lock中の `RESTORE_LOCKED` を通常sync protocolへ統合

## 5. Box.code / Device
- [x] `BX-<DevicePrefix 4><LocalSequence 4>`
- [x] DevicePrefix User-scope unique / server allocation
- [x] LocalSequence atomic increment
- [x] prefix追加割当と `expectedActivePrefix`
- [x] sequence/prefix exhaustion方針
- [x] device stateは通常backup対象外
- [ ] Device / DevicePrefix server schema
- [ ] register/allocate-prefix API詳細
- [ ] local device state schemaと初期化/復旧手順

## 6. Box / Item / BoxLocation
- [x] Item取り出し = `boxId=UNASSIGNED`
- [x] delete = tombstone
- [x] Box delete → child ItemをUNASSIGNED
- [x] BoxLocation delete → child BoxをUNASSIGNED
- [x] parent delete + child correctionはserver atomic operation
- [x] BoxLocationはflat independent master
- [ ] 各entity field/validation最終仕様
- [ ] BoxLocation同名後勝ち自動rename仕様を現行全体設計と再確認
- [ ] CRUD APIとtransaction境界を確定

## 7. Photo / Blob
- [x] photoId独立identity / no dedup
- [x] 1 photoId = exactly 1 Business parent
- [x] parentごと0〜10枚、順序はbusiness-significant
- [x] original WebP 1600px/q0.85/5MiB
- [x] thumbnail WebP 400px/q0.8/256KiB
- [x] photoHash / blob-first / unreferenced 30日GC
- [x] direct parent-to-parent photo moveはv0.8対象外
- [ ] normal ingestion/upload/retry stateの最終整理
- [ ] server original/thumbnail APIとvalidation
- [ ] local cache/GCとserver orphan GCの境界
- [ ] photo削除10秒Undo仕様を通常Business設計へ統合

## 8. Backup / Restore
- [x] self-contained `.hkmbackup` ZIP + manifest/checksums/original/thumbnail
- [x] backup exportはforeground operation、未同期local Businessを含む
- [x] Restoreはonline operation
- [x] Restore開始時にUser Restore lock取得
- [x] lock中は他端末Business Pull/Push/blob upload停止、local作業は継続
- [x] 長期中断再開なし
- [x] RestoreHistoryなし
- [x] persistent RestoreConflictなし
- [x] full binary stagingなし
- [x] RestoreApplyMarker = applyId + promotedPhotoIds[] + appliedAt
- [x] server applyはapplyId idempotency + short-lived COMMITTED result
- [ ] local/server applyの正確な順序を確定
- [ ] Restore lock lease時間/renew interval/API詳細
- [ ] RestoreApplyResult retentionを確定
- [ ] Restore owner photo uploadとserver Business commit境界
- [ ] Restore UI最終フロー
- [ ] `restore-session-design.md`を現行仕様だけに再構成

## 9. QR / Search / Label Print
- [x] QR payload = canonical Box.codeのみ
- [ ] QR読取時のlookup/error/offline挙動
- [ ] 検索対象field・matching・offline挙動
- [ ] 24mm tape label layout最終仕様
- [ ] print/export/browser capability fallback

## 10. PWA / Offline / Authentication
- [x] offline local編集 + reconnect sync基本方針
- [ ] PWA install/update/cache policy
- [ ] service worker cache対象/更新失敗時挙動
- [ ] auth session expiry中のoffline操作と再認証後sync
- [ ] User切替時の `hk-local-v2-<User.id>` lifecycle
- [ ] storage quota/eviction時の通常data保護方針

## 11. UI / UX
- [ ] 登録フロー各stepの戻る/skip/cancel
- [ ] sync状態表示
- [ ] normal SyncConflict UI
- [ ] Restore conflict/confirmation/progress/completion UI
- [ ] offline / RESTORE_LOCKED / auth expired表示
- [ ] delete/Undo表示
- [ ] accessibility・mobile/PWA基本確認

## 12. v1.0
- [-] Vision/LLM詳細要件
- [-] Vision/LLM設計
- [-] Vision/LLM test/implementation
v0.8設計完了後に別工程で扱う。

## 13. 設計完了条件
以下をすべて満たした時点でv0.8設計完了とする。
- [ ] 上記v0.8設計項目がすべて[x]
- [ ] Worklog間の矛盾を解消
- [ ] 現行設計の正本/参照関係を明示
- [ ] 現行実装との差分一覧を更新
- [ ] 要件→設計のtraceabilityを確認
- [ ] 利用者による設計完了承認

設計完了承認後のみ、次工程「テストケース作成」へ進む。
