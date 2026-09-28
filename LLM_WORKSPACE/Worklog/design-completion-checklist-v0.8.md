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
- [x] 現行設計を正式docsへ配置し、アーキテクチャ正本文書を分割
- [x] v0.8画面遷移と保存境界 = navigation非commit / Business+Outbox atomic / Restore server-first / 全操作matrix確認

## 3. Data Model
- [x] Box / Item / BoxLocationの基本関係
- [x] reserved `UNASSIGNED` Box / BoxLocation
- [x] server sync metadata方針
- [x] business identity = `(User.id, entityId)`
- [x] contentHash canonicalization基本規則
- [x] Box / Item / BoxLocation / Outbox / SyncState / SyncConflict / SyncChangeLogの最終field schema
- [x] server DB unique/index/FK/transaction制約
- [x] local IndexedDB = hk-local-v2-<User.id> / schemaVersion 1 / store・migration方針
- [x] RestoreApplyResult / RestoreLockの最小schema
- [x] RestoreApplyMarkerは `applyId` のみ

## 4. 通常Sync / Conflict / Full Resync
- [x] 通常sync = Pull → Outbox reapply → Push → Pull
- [x] revision + contentHash conflict方式
- [x] SyncChangeLog + global syncSeq
- [x] tombstone 30日 / SyncChangeLog 90日
- [x] Full Resync snapshotSeq + staging + Outbox再適用
- [x] Outbox reapply順 = BoxLocation → Box → Item
- [x] Push/Pull API request/response/error code詳細
- [x] blob uploadを含む通常sync = Pull→Outbox reapply→photo server-ready→Business Push→final Pull
- [x] SyncConflict = KEEP_SERVER / USE_LOCAL、stale時再選択、最新Outboxをlocal候補
- [x] Full Resync = immutable server snapshot / keyset paging / staging / atomic adopt
- [x] Restore lock中の `RESTORE_LOCKED` = Push/Pull request-level 409 retryable
- [x] Box parent cycle = local時点で不正なら保存前validation / 別端末先行変更でSync時に初めて不成立ならSyncConflictで利用者確認
- [x] Conflict解決時もcurrent Box graphを再検証し、成立不能なUSE_LOCALは強制適用せず収納先変更またはKEEP_SERVERを利用者選択

## 5. Box.code / Device
- [x] `BX-<DevicePrefix 4><LocalSequence 4>`
- [x] DevicePrefix User-scope unique / server allocation
- [x] LocalSequence atomic increment
- [x] prefix追加割当と `expectedActivePrefix`
- [x] sequence/prefix exhaustion方針
- [x] device stateは通常backup対象外
- [x] Device / DevicePrefix server schema = User-scoped Device + permanently reserved prefix records
- [x] register/allocate-prefix API = idempotent register + expectedActivePrefix compare-and-switch
- [x] local DeviceState + atomic sequence + data loss時new device/prefix再setup

## 6. Box / Item / BoxLocation
- [x] Item取り出し = `boxId=UNASSIGNED`
- [x] delete = tombstone
- [x] Box delete → child ItemをUNASSIGNED
- [x] BoxLocation delete → child BoxをUNASSIGNED
- [x] parent delete + child correctionはserver atomic operation
- [x] BoxLocationはflat independent master
- [x] Box nesting = optional parentBoxId / same User active Box / cycle禁止 / nested BoxはlocationId=nullでparentBoxIdのみ保持
- [x] 物理Locationはancestor chainから解決 / parent Box削除時はdirect childのみparentBoxId=null + locationId=UNASSIGNED / deeper nesting維持
- [x] 各entity field/validation最終仕様
- [x] BoxLocation同名後勝ちauto-rename = server受理側優先、既存を最小 name(n)
- [x] CRUD logical transaction境界を確定

## 7. Photo / Blob
- [x] photoId独立identity / no dedup
- [x] 1 photoId = exactly 1 Business parent
- [x] parentごと0〜10枚、順序はbusiness-significant
- [x] original WebP 1600px/q0.85/5MiB
- [x] thumbnail WebP 400px/q0.8/256KiB
- [x] photoHash / blob-first / unreferenced 30日GC
- [x] direct parent-to-parent photo moveはv0.8対象外
- [x] normal ingestion/upload/retry = immutable original identity + PENDING/UPLOADING/CONFIRMED + retry metadata
- [x] server photo API = status/original/thumbnail/confirm + idempotent validation
- [x] local/server photo GC = referenced originals保全 + thumbnail cache + unreferenced 30日GC
- [x] photo削除10秒Undo = delete即Business commit / Undoは新Business update / Sync非停止

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
- [x] server-first Restore / RestoreApplyMarker = applyId only
- [x] server applyはapplyId idempotency + short-lived COMMITTED result
- [x] local/server apply順序 = server-first
- [x] Restore lock = 60秒lease / 20秒renew / owner token API
- [x] RestoreApplyResult retention = server commitから7日
- [x] Restore owner photo upload完了・検証後にserver Business atomic commit
- [x] Backup/RestoreはparentBoxId/locationIdを保持し、conflict選択後final Box graph全体をcycle/reference/XOR検証してからapply
- [x] Restore UI = file選択→lock/validation→conflict→summary→apply→COMMITTED→local adopt→完了
- [x] `restore-session-design.md`を判断履歴summaryへ再構成

## 9. QR / Search / Label Print
- [x] QR payload = canonical Box.codeのみ
- [x] QR lookup = canonical validation + local-first + normal Sync retry + offline non-authoritative not-found
- [x] Search = local Business / defined fields / NFC case-insensitive substring / multi-token AND / offline-capable
- [x] 24mm label = 70x24mm standard / 18mm QR + full Box.code + auxiliary Box.name
- [x] print/export fallback = browser print + PDF + PNG / optional printer adapter / mobile-PWA fallback

## 10. PWA / Offline / Authentication
- [x] offline local編集 + reconnect sync基本方針
- [x] PWA install/update/cache = optional install / versioned app shell / safe-boundary update / IndexedDB preservation
- [x] Service Worker = navigation network-first / versioned assets cache-first / Business API network-only / atomic install + old-version fallback
- [x] auth expiry = bound User local編集継続 / server操作停止 / same-User reauth後normal Sync / cross-user禁止
- [x] User switch = close old User DB / preserve its Outbox+photos+DeviceState / open separate new User DB / no cross-user transfer or background Sync
- [x] storage quota/eviction = Class A primary data保護 / reconstructible cache優先cleanup / persistent storage request / loss検知後Full Resync

## 11. UI / UX
- [x] 登録flow = stepごと即時保存 / Backはrollbackなし / optional step skip / Box作成後Cancelはflow終了のみ
- [x] sync表示 = global + entity state / SYNCED-PENDING-SYNCING-CONFLICT-BLOCKED + offline/auth/Restore context
- [x] normal SyncConflict UI = 一覧/差分/個別解決/stale再比較
- [x] Restore conflict/confirmation/progress/completion UI
- [x] offline / AUTH_EXPIRED / RESTORE_LOCKED = global status + affected operation + next action / local data継続
- [x] delete/Undo = entity delete事前確認 / Box・Location child影響明示 / Photo即時delete + 10秒Undo
- [x] accessibility/mobile/PWA baseline = responsive + touch + keyboard + semantics + fallback + PWA safe-area/offline/update

## 12. v1.0
- [-] Vision/LLM詳細要件
- [-] Vision/LLM設計
- [-] Vision/LLM test/implementation
v0.8設計完了後に別工程で扱う。

## 12.1 旧版機能継承確認
- [x] 旧版画面/APIの機能棚卸しを実施し、`legacy-feature-inheritance-matrix.md` を作成
- [x] Box内Item絞り込み検索は必須とせず、カテゴリ等の並べ替えを優先
- [x] Box内Item一覧 = 独立categoryなし / 複数tagsをカテゴリ利用 / 通常一覧は重複なし / tag group表示では複数group所属可
- [x] PhotoRef順序変更 = drag/touch drag + 前へ/後ろへ、親Business update、offline対応、競合時auto-mergeなし
- [x] User新規登録/Login = authenticated session確立後User別DB open/create、TOTP有効時はchallenge完了までBusiness API不可
- [x] MFA/TOTP = login/setup/verify/status/disable/recovery code再発行をv0.8継承、secret/recoveryはBusiness backup/local DB対象外
- [x] User名/User iconをv0.8継承 / Device管理は新Deviceモデルへ置換 / login session一覧・失効は認証領域として分離維持
- [x] QR legacy互換なし = v0.8.0初版、payloadはcanonical Box.codeのみ
- [x] A4 label = ラベルプリンタ非所有者向け代替としてv0.8継承、canonical label rendererを面付け
- [x] Theme = built-in System/Light/Dark + user themeへ統合。server正本 + User-scoped local cache。詳細は `95_Theme_Help設計.md`
- [x] Help = v0.8正式機能。offline bundled content + 主要17章 + deep link。詳細は `95_Theme_Help設計.md`
- [x] Settings home = 旧実装を基準にカテゴリ再編。Profile/Security/Login session/Box.code Deviceを分離し、旧Sync endpoint/token・QR legacy設定・v0.8 Vision UIを除外
- [-] Vision旧機能の詳細設計はv1.0。ただし旧provider/prompt/test/Item・Box写真認識を継承候補として記録済み

## 13. 設計完了条件
以下をすべて満たした時点でv0.8設計完了とする。
- [ ] 上記v0.8設計項目がすべて[x]
- [ ] Worklog間の矛盾を解消
- [x] 現行設計の正本/参照関係を明示
- [ ] 現行実装との差分一覧を更新
- [ ] 要件→設計のtraceabilityを確認
- [ ] 利用者による設計完了承認

設計完了承認後のみ、次工程「テストケース作成」へ進む。
