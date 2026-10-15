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

- 対象ブランチ: `develop`（検証対象の追加コミット: `05a61ff`、`1f6825e`、`dfc38c0`、`216c318`、`1d197c5`、`43101f4`、`876b1d3`、`03ac08f`）
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

### 2.1 追加検証（8ケース、2026-10-15）

```powershell
node apps/web/tests/run-mfa-api-sqlite.mjs
# 8 / 8 PASS
node apps/web/tests/run-mfa-api-sqlite.mjs --repeat=20
# 各回 8 / 8 PASS、計 160 / 160 PASS
```

| 追加検証項目 | 実測結果 | 判定 |
|---|---|---|
| 同一ユーザーの異なるchallengeから並列失敗 | 失敗5件の計上・ロック・challenge未消費 | PASS（20/20回） |
| 同一Recovery Codeの並列消費 | 成功1件・session1件・コード消費1回 | PASS（20/20回） |
| 不正JSON・使用済み・期限切れchallenge | HTTP 400/404、MFA失敗カウンター非加算 | PASS（20/20回） |
| 端末関連付けの模擬失敗 | HTTP 500、Cookie非発行、新規sessionのrevokedAt設定、MFA失敗カウンター非加算 | PASS（20/20回） |

上記4項目に加え、従来の4項目も各20/20回PASS。端末関連付け失敗テストの `TEST_DEVICE_FAILURE` は意図的な例外であり、テスト失敗ではない。通常実行も8/8 PASS。実行結果は開発者提示のWindowsローカルログに基づく。

### 2.2 ロック期限のミリ秒境界検証（10ケース、2026-10-15）

```powershell
node apps/web/tests/run-mfa-api-sqlite.mjs
# 10 / 10 PASS
node apps/web/tests/run-mfa-api-sqlite.mjs --repeat=20
# 各回 10 / 10 PASS、計 200 / 200 PASS
```

| 追加検証項目 | 実測結果 | 判定 |
|---|---|---|
| ロック期限の1ms前・一致・1ms後 | 1ms前のみロック中、期限一致で解除 | PASS（20/20回） |
| ロック期限1ms前の失敗 | 既存ロック期間と失敗回数を維持、期限延長なし | PASS（20/20回） |

従来の8項目も全20回でPASS。ローカルWindows実行ログによる結果であり、CI実行結果ではない。

### 2.3 複数Node.jsプロセス競合検証（2026-10-15）

`apps/web/tests/run-mfa-multiprocess-sqlite.mjs` をWindows PowerShellから実行した。

```powershell
node apps/web/tests/run-mfa-multiprocess-sqlite.mjs
# 1回 PASS（5/5プロセス成功）
node apps/web/tests/run-mfa-multiprocess-sqlite.mjs --repeat=20
# 20/20回 PASS（計100/100プロセス成功）
```

各回5つの独立Node.jsプロセス・PrismaClientから、同一の一時SQLite DBへ失敗加算を行った。全回で `failCount=5`、`lockedUntil` 設定、失敗0件を確認した。実施結果は開発者提示のローカル実行ログに基づく。**HTTP/TOTPハンドラー全体の複数プロセス競合を検証したものではない。** また高負荷・SQLite busyの強制再現は未実施。

### 2.4 単一Next.js HTTPサーバー経由のRecovery Code競合検証（2026-10-15）

`apps/web/tests/run-mfa-http-sqlite.mjs` により、独立した一時SQLite DBと実際のNext.js HTTPサーバーを用いて、同一Recovery Codeの2リクエスト同時使用を検証した。

```powershell
node apps/web/tests/run-mfa-http-sqlite.mjs
# 1/1 PASS
node apps/web/tests/run-mfa-http-sqlite.mjs --repeat=20
# 20/20 PASS
```

各回でHTTP応答 `[200,404]`、発行セッション1件（有効1件）、使用済みチャレンジ1件、Recovery Code残数0件を確認。開発者提示のWindowsローカル実行ログに基づく。**複数Next.jsサーバープロセス間のHTTP競合は未検証。**

## 3. 評価

この検証環境と20回の試行では、並列5件の失敗加算漏れ、閾値回避、SQLiteロック競合によるHTTP 500は観測されなかった。ロック解除後のカウンター初期化、ユーザー分離、正常ログインによるリセットも期待どおりだった。

**判定範囲:** 上記10シナリオはローカルSQLite実DB API統合テストとして検証済み。すべての並列条件・運用環境の安全性を保証するものではない。

## 4. 未検証・残課題

| 項目 | 状態 |
|---|---|
| 複数Node.jsプロセス・複数PrismaClient間のMFA失敗加算 | 独立プロセス5本×20回で検証済み（100/100成功）。HTTP API全体は未検証 |
| 高負荷・長時間連続・SQLite busy条件の強制再現 | 未検証 |
| 実際のTOTP暗号化・復号と時刻窓 | 本統合テストではモック |
| 実際の端末登録・Cookie・セッション関連付けの全経路 | 本統合テストではモック |
| ロック期限の厳密な境界時刻（期限1ms前・一致・1ms後） | SQLite実DBで検証済み（20/20回） |
| 新規パスワードログインからのMFAロック拒否 | 本統合テストでは未検証（既存単体テストと区別） |
| 不正JSON・使用済み・期限切れchallengeの非加算 | SQLite実DB API統合テストで検証済み（20/20回） |
| 端末関連付け失敗時のセッション失効・Cookie非発行・非加算 | デバイス処理のモック例外注入で検証済み（20/20回）。実端末登録処理は未検証 |
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
