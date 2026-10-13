<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-090500Z-AULTPT
lang: ja-JP
canonical_title: ログイン2段階認証テスト仕様（POST /api/auth/login/totp）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン2段階認証テスト仕様（POST /api/auth/login/totp）

# ログイン2段階認証テスト仕様（POST /api/auth/login/totp）

本書は、ログイン2段階認証 API（POST /api/auth/login/totp）のテスト仕様を定義する。  
本書の期待結果をテスト実装の目標契約とする。現行 Vitest（apps/web/tests/api.auth.login.totp.spec.ts）には旧SyncToken方式のモックが残っており、修正・再検証が必要。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_LOGIN_TOTP-TC-01 | sec_auth_login_totp_success |
| AUTH_LOGIN_TOTP-TC-02 | sec_auth_login_totp_invalid_request, sec_auth_login_totp_request |
| AUTH_LOGIN_TOTP-TC-04 | sec_auth_login_totp_challenge_validation |
| AUTH_LOGIN_TOTP-TC-05 | sec_auth_login_totp_invalid_code, sec_auth_login_totp_security |
| AUTH_LOGIN_TOTP-IMPL-01 | sec_auth_login_totp_locked |
| AUTH_LOGIN_TOTP-IMPL-02 | sec_auth_login_totp_internal_error |
| AUTH_LOGIN_TOTP-TC-06 | sec_auth_login_totp_locked, sec_auth_login_totp_invalid_code |
| AUTH_LOGIN_TOTP-TC-07 | sec_auth_login_totp_locked |
| AUTH_LOGIN_TOTP-TC-08 | sec_auth_login_totp_locked |
| AUTH_LOGIN_TOTP-TC-09 | sec_auth_login_totp_locked, sec_auth_login_totp_success |
| AUTH_LOGIN_TOTP-TC-10 | sec_auth_login_totp_locked |
| AUTH_LOGIN_TOTP-TC-11 | sec_auth_login_totp_success, sec_auth_login_totp_locked |
| AUTH_LOGIN_TOTP-TC-12 | sec_auth_login_totp_challenge_validation, sec_auth_login_totp_locked |

---

## 2. テストケース

### AUTH_LOGIN_TOTP-TC-01 正常：challengeId + 正しい code

#### 対応 sec_id

- sec_auth_login_totp_success

#### 条件

- challenge が有効
- `totpEnabled=true`
- 正しい TOTP code

#### 入力

```json
{
  "challengeId": "C1",
  "code": "123456"
}
```

#### 期待結果

- HTTP 200
- `ok:true`
- `hk_session` と `hk_device` Cookie 発行（HttpOnly等の属性はセッション・端末仕様に準拠）
- AuthSessionをDBに作成し、平文tokenをDBに保存しない
- challenge が使用済みへ更新される

---

### AUTH_LOGIN_TOTP-TC-02 異常：必須項目不足

#### 対応 sec_id

- sec_auth_login_totp_invalid_request
- sec_auth_login_totp_request

#### 条件

- `challengeId` 未指定
- `null`
- body 不正

#### 期待結果

- HTTP 400

---

### AUTH_LOGIN_TOTP-TC-04 異常：challenge 不正

#### 対応 sec_id

- sec_auth_login_totp_challenge_validation

#### 条件

- challenge 不存在
- challenge 期限切れ
- challenge 使用済み

#### 期待結果

- HTTP 404 + `not_found`

---

### AUTH_LOGIN_TOTP-TC-05 異常：TOTP 検証失敗

#### 対応 sec_id

- sec_auth_login_totp_invalid_code
- sec_auth_login_totp_security

#### 条件

- challenge は有効
- code 不一致
- recoveryCode 不一致

#### 期待結果

- ロック未到達なら HTTP 400 + `auth_failed`
- MFAログイン専用の失敗回数を1加算（現実装は未対応）

---

### AUTH_LOGIN_TOTP-IMPL-01 異常：ロック中

#### 対応 sec_id

- sec_auth_login_totp_locked

#### 条件

- `lockUntil > now()`

#### 期待結果

- 既存 `User.lockUntil` が未来なら HTTP 401 + `unauthorized`（現実装）
- 新しいMFAログイン専用ロックが未来なら HTTP 429 + `too_many_attempts`（実装予定）

---

### AUTH_LOGIN_TOTP-IMPL-02 異常：内部例外

#### 対応 sec_id

- sec_auth_login_totp_internal_error

#### 条件

- DB / token / crypto 処理が例外を throw

#### 期待結果

- HTTP 500
- `error=internal_error`

---

## 3. MFAログイン専用試行制限の追加テスト（未実装）

基準設計: `LLM_WORKSPACE/Worklog/mfa-login-attempt-model-20261013.md`、`LLM_WORKSPACE/Worklog/totp-rate-limit-crosscheck-20261013.md`。既存 `User.totpFailCount`（TOTP初期設定用）と `User.lockUntil` の意味は変更しない。

| testcase_id | 条件・操作 | 期待結果 |
|---|---|---|
| AUTH_LOGIN_TOTP-TC-06 | 有効challengeで誤ったTOTPまたはRecovery Codeを1～4回送信 | MFAログイン専用failCountが各回1増加。HTTP 400 `auth_failed`。challenge未消費 |
| AUTH_LOGIN_TOTP-TC-07 | 有効challengeで5回目の認証失敗 | 専用lockedUntilが15分後に設定され、HTTP 429 `too_many_attempts`。新規パスワードログインも拒否 |
| AUTH_LOGIN_TOTP-TC-08 | ロック期限直前と期限到達後の試行 | 期限前は拒否、期限到達後は再試行可能。次の失敗は1回目 |
| AUTH_LOGIN_TOTP-TC-09 | Recovery Codeを誤入力した後、正しいコードで成功 | 誤入力は失敗回数に計上。成功はコードを一度だけ消費し、専用カウンターをリセット |
| AUTH_LOGIN_TOTP-TC-10 | 同一Userの複数challengeから失敗リクエストを並行送信 | 加算漏れ・ロック閾値回避なし。DB更新は競合安全 |
| AUTH_LOGIN_TOTP-TC-11 | 失敗1～4回の後、正しいTOTPで成功 | challenge消費とAuthSession作成が成功し、専用failCount=0、lockedUntil=null |
| AUTH_LOGIN_TOTP-TC-12 | 不正JSON、存在しない・期限切れ・使用済みchallenge、端末関連付け失敗 | MFA失敗回数に計上しない。端末関連付け失敗時に新sessionを失効 |

追加の回帰検証: `/api/auth/totp/verify` および `/api/auth/totp/disable` はMFAログイン専用カウンターを変更しない。既存 `User.lockUntil` は従来どおり別途判定する。セッションCookieはMFA完了前に発行しない。

**実装ゲート:** この表は今後の期待動作であり、現行APIが合格したことを示さない。専用モデルmigration、正式API仕様更新、テスト追加後に実装・検証する。

---

## 4. ローカル検証手順

```powershell
pnpm -C apps/web exec vitest --run
```

実際の実行結果を記録すること。過去の固定件数を合格基準として使用しない。

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン2段階認証テスト仕様（POST /api/auth/login/totp）
