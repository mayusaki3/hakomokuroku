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
apps/web/tests/api.auth.login.totp.spec.ts の Vitest を正とする。

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
- ログイン Cookie 発行
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

- HTTP 400 または 404
- 現実装は 404

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

- HTTP 400 / 401 / 422 のいずれか
- 現実装は 400 + auth_failed

---

### AUTH_LOGIN_TOTP-IMPL-01 異常：ロック中

#### 対応 sec_id

- sec_auth_login_totp_locked

#### 条件

- `lockUntil > now()`

#### 期待結果

- HTTP 401 または 429
- 現実装は 401 + locked

---

### AUTH_LOGIN_TOTP-IMPL-02 異常：内部例外

#### 対応 sec_id

- sec_auth_login_totp_internal_error

#### 条件

- DB / token / crypto 処理が例外を throw

#### 期待結果

- HTTP 500
- `error=server_error`

---

## 3. ローカル検証手順

```powershell
pnpm -C apps/web exec vitest --run
```

期待結果：

```text
Test Files  22 passed
Tests       218 passed
```

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン2段階認証テスト仕様（POST /api/auth/login/totp）
