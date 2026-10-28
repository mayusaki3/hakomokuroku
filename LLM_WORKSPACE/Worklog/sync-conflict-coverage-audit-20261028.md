# v0.8 DB/API網羅性監査 — SyncConflict（2026-10-28）

対象: `develop`、基準コミット `1fecbcd`。本書は実装確認記録であり、仕様変更の承認ではない。

## 参照正本
- `docs/ja-JP/02_アーキテクチャ/50_同期モデル.md`
- `docs/ja-JP/02_アーキテクチャ/60_同期設計.md`
- `docs/ja-JP/02_アーキテクチャ/81_API_Business_同期.md`
- `docs/ja-JP/02_アーキテクチャ/40_DBスキーマ定義.md`

## 実装確認
- `apps/web/prisma/schema.prisma`: `SyncConflict` モデルあり（`@@unique([userId, entityType, entityId])`）。
- `apps/web/src/server/sync-push-v2.ts`: revision不一致をCONFLICTとして返すが、contentHash一致のUNCHANGED処理なし。SyncConflict行の作成・更新なし。Box graphのcycle/reference validationを同関数内で確認できない。
- `apps/web/src/app/api/sync/v2/push/route.ts`: 単一操作、CONFLICTはHTTP 409。
- `apps/web/src/server/sync-push-protocol.ts`: 単一operationのparse/receipt fingerprint。
- `apps/web/src/app/api/sync/`: `v2/push`, `v2/pull`, `v2/full-resync` のみ。Conflict一覧・解決のAPI routeは未確認。

## 設計要求と差分

| ID | 要求 | 現状 | 優先度 |
| --- | --- | --- | --- |
| SC-01 | revision不一致かつcontentHash一致ならUNCHANGED | CONFLICTになる | 高 |
| SC-02 | revision/contentHash不一致でSyncConflictを永続化 | 未実装 | 高 |
| SC-03 | 同じ競合を再送しても重複させない | SyncPushReceiptはあるが競合本体なし | 高 |
| SC-04 | GET conflict一覧をUser scopeで返す | API routeなし | 高 |
| SC-05 | KEEP_SERVERで正本維持・競合削除 | API routeなし | 高 |
| SC-06 | USE_LOCALで再検証・正本更新・ChangeLog追加 | API routeなし | 高 |
| SC-07 | 解決時にcurrent revisionを比較しCONFLICT_STALE | API routeなし | 高 |
| SC-08 | Box親子graphの参照/cycle検証とmulti-device競合 | Push実装内で未確認 | 高 |
| SC-09 | request envelopeとoperation別結果の契約 | 現行v2は単一操作 | 中（契約確定要） |
| SC-10 | 競合中のlocal Outboxを保持し最新payloadで解決 | client側の解決処理未確認 | 高 |

## 検証・実装順序
1. 既存`sync-push-v2.sqlite.spec.ts`の回帰ケースを保全。
2. SC-01のUNCHANGED分岐、receipt、revision/contentHash一致・不一致のSQLiteケースを追加。
3. SC-02/03の競合保存・重複排除・User scope検証。
4. SC-04〜07の一覧・個別解決APIとstale/同時操作テスト。
5. SC-08のgraph integrityと競合解決時の再検証。
6. SC-09のAPI契約差分を整理しclientを含めて移行。
7. SC-10のlocal Outbox reconciliationを確認。
8. TypeScript、Vitest、専用SQLite検証を完了するまでUI実装には入らない。

## 注意
- 既存ユーザーの`dev.db`や未追跡DB・バックアップを操作しない。
- 旧作業記録の`UNASSIGNED`予約ID表記と新設計の`null`表記は混在する。正式設計と現行v2 payloadに基づいて判定する。
- 389件PASSは既存テストの結果であり、上記未実装要件のPASSを意味しない。
