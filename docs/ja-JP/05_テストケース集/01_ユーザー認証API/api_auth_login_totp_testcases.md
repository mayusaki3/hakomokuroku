[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）

# テストケース：ログイン2段階認証（POST /api/auth/login/totp）

## 1. 前提

- ベース URL: `/api/auth/login/totp`
- `/api/auth/login` により LoginChallenge が発行済み
- `challengeId` を使用して認証する
- ユーザー状態（`totpEnabled` / `totpSecretEnc` / `recoveryCodes` / `totpFailCount` / `lockUntil`）を DB モックで制御

---

## 2. 対応仕様

| テストケースID | 対応 sec_id | 検証責務 |
|---|---|---|
| AUTH_LOGIN_TOTP-TC-01 | sec_auth_login_totp_success | 正しい code でログインを完了する |
| AUTH_LOGIN_TOTP-TC-02 | sec_auth_login_totp_invalid_request | 必須項目不足を 400 にする |
| AUTH_LOGIN_TOTP-TC-03 | sec_auth_login_totp_invalid_request | Content-Type 不正を 400 にする |
| AUTH_LOGIN_TOTP-TC-04 | sec_auth_login_totp_challenge_validation | challenge 不存在 / 期限切れ / 使用済みを拒否する |
| AUTH_LOGIN_TOTP-TC-05 | sec_auth_login_totp_invalid_code | 認証コード不一致を拒否する |
| AUTH_LOGIN_TOTP-IMPL-01 | sec_auth_login_totp_locked | lockUntil が未来なら拒否する |
| AUTH_LOGIN_TOTP-IMPL-02 | sec_auth_login_totp_internal_error | 内部例外を 500 にする |

---

## 3. テストケース詳細

### AUTH_LOGIN_TOTP-TC-01 正常: challengeId + 正しい code（200）

- 対応 sec_id:
  - sec_auth_login_totp_success
- 前提:
  - LoginChallenge が有効
  - User の `totpEnabled=true`
  - 正しい TOTP code
- 入力:

```json
{
  "challengeId": "C1",
  "code": "123456"
}
```

- 期待:
  - 200
  - ok:true
  - ログイン用 token / cookie 発行
  - LoginChallenge.used=true

---

### AUTH_LOGIN_TOTP-TC-02 必須チェック（400）

- 対応 sec_id:
  - sec_auth_login_totp_invalid_request
- 条件:
  - challengeId 未指定
  - code / recoveryCode 両方未指定
- 期待:
  - 400

---

### AUTH_LOGIN_TOTP-TC-03 Content-Type 不正（400）

- 対応 sec_id:
  - sec_auth_login_totp_invalid_request
- 条件:
  - application/json 以外
- 期待:
  - 400

---

### AUTH_LOGIN_TOTP-TC-04 challenge 不存在 / 期限切れ / 使用済み（400/404）

- 対応 sec_id:
  - sec_auth_login_totp_challenge_validation
- 条件:
  - challengeId が存在しない
  - challenge が期限切れ
  - challenge.used=true
- 期待:
  - 400 または 404

---

### AUTH_LOGIN_TOTP-TC-05 TOTP 検証失敗（400/401/422）

- 対応 sec_id:
  - sec_auth_login_totp_invalid_code
  - sec_auth_login_totp_security
- 条件:
  - challengeId は有効
  - code 不一致
  - recoveryCode 不一致
- 期待:
  - 400 / 401 / 422 のいずれか

---

### AUTH_LOGIN_TOTP-IMPL-01 lockUntil が未来（401/429）

- 対応 sec_id:
  - sec_auth_login_totp_locked
- 条件:
  - User.lockUntil が未来
- 期待:
  - 401 または 429

---

### AUTH_LOGIN_TOTP-IMPL-02 内部例外（500）

- 対応 sec_id:
  - sec_auth_login_totp_internal_error
- 条件:
  - DB / crypto / token 発行処理で例外
- 期待:
  - 500
  - error = internal_error 相当

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）
