<!--
HLDocS:LLM-MANAGED
doc_id: doc-20261015-040000Z-MFAVAL
lang: ja-JP
canonical_title: MFAログイン試行制限 検証記録（2026-10-15）
document_type: report
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > MFAログイン試行制限 検証記録

# MFAログイン試行制限 検証記録（2026-10-15）

## 1. 対象・前提

- 対象ブランチ: `develop`（検証対象の追加コミット: `05a61ff`、`1f6825e`、`dfc38c0`）
- 実施日: 2026-10-15
- 実行環境: Windows PowerShell、Node.js、Vitest 2.1.9、Prisma 6.18.0、SQLite（一時DB）
- 実行ログ: 開発者から提示されたローカル実行ログを根拠とする。CIでの実行結果ではない。
- APIテスト: `apps/web/tests/api.auth.login.totp.sqlite.spec.ts`
- 実行スクリプト: `apps/web/tests/run-mfa-api-sqlite.mjs`
- Prismaは実DBに接続。TOTPコード判定・デバイス登録はモック。HTTPサーバー経由ではなくPOSTハンドラーを直接呼び出す。

## 2. 実行コマンドと結果

```powershell
node apps/web/tests/run-mfa-api-sqlite.mjs
# 4 / 4 PASS
node apps/web/tests/run-mfa-api-sqlite.mjs --repeat=20
# 各回 4 / 4 PASS、計 80 / 80 PASS
```

繰り返し実行は、各回の前に検証専用SQLite DBをリセットする。既存の `dev.db` は操作しない。

| 検証項目 | 実測結果 | 判定 |
|---|---|---|
| 同一ユーザーの誤コード5件を並列送信 | 各回HTTP 400×4、429×1、failCount=5、lockedUntil設定 | PASS（20/20回） |
| 期限切れロック後の誤コードと正常ログイン | 失敗は400・カウンター1、続く成功は200・カウンター0 | PASS（20/20回） |
| Aユーザーがロック中のBユーザー正常ログイン | BのHTTP 200、Bの試行記録なし | PASS（20/20回） |
| 失敗3回の状態から正常ログイン | HTTP 200、MFAカウンター0、登録用totpFailCountは2を維持 | PASS（20/20回） |

通常実行も4/4 PASS。以前に実施したモック中心の認証API・MFA単体テストは20/20 PASS。独立したSQLite更新スクリプトでも順次失敗・期限切れ・並列処理がPASSしているが、これはAPIハンドラーを直接検証するものではない。

## 3. 評価

この検証環境と20回の試行では、並列5件の失敗加算漏れ、閾値回避、SQLiteロック競合によるHTTP 500は観測されなかった。ロック解除後のカウンター初期化、ユーザー分離、正常ログインによるリセットも期待どおりだった。

**判定範囲:** 上記4シナリオはローカルSQLite実DB API統合テストとして検証済み。すべての並列条件・運用環境の安全性を保証するものではない。

## 4. 未検証・残課題

| 項目 | 状態 |
|---|---|
| 複数Node.jsプロセス・複数PrismaClient間の競合 | 未検証 |
| 高負荷・長時間連続・SQLite busy条件の強制再現 | 未検証 |
| 実際のTOTP暗号化・復号と時刻窓 | 本統合テストではモック |
| 実際の端末登録・Cookie・セッション関連付けの全経路 | 本統合テストではモック |
| ロック期限の厳密な境界時刻（期限直前・一致時刻） | 本統合テストでは未検証 |
| 新規パスワードログインからのMFAロック拒否 | 本統合テストでは未検証（既存単体テストと区別） |
| 不正JSON・無効challenge・端末関連付け失敗時のカウンター非加算 | 本統合テストでは未検証 |
| MFA以外のTOTP設定・無効化APIへの回帰影響 | この記録の対象外 |
| CI・Linux・本番相当環境 | 未検証 |

Prisma `package.json#prisma` 非推奨警告は発生したが、テスト失敗ではない。メジャーバージョン更新は別作業として扱う。

## 5. 関連資料

- [TOTPログイン テスト仕様](./api_auth_login_totp_testcases.md)
- `apps/web/src/server/mfa-login-attempt.ts`
- `apps/web/src/app/api/auth/login/totp/route.ts`
- `apps/web/tests/api.auth.login.totp.sqlite.spec.ts`
- `apps/web/tests/run-mfa-api-sqlite.mjs`

[目次](../../目次.md) > テストケース集 > ユーザー認証API > MFAログイン試行制限 検証記録
