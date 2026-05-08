[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン（POST /api/auth/login）

# テストケース：ログイン（POST /api/auth/login）

## 1. 対応仕様

| テストケースID | 対応 sec_id | 検証責務 |
|---|---|---|
| AUTH_LOGIN-TC-01 | sec_auth_login_success_basic | TOTP 無効ユーザーの正常ログイン |
| AUTH_LOGIN-TC-02 | sec_auth_login_invalid_request | 必須項目不足を 400 にする |
| AUTH_LOGIN-TC-03 | sec_auth_login_invalid_request | body / JSON 不正を 400 にする |
| AUTH_LOGIN-TC-04 | sec_auth_login_auth_failed | userId 不一致を 401 にする |
| AUTH_LOGIN-TC-05 | sec_auth_login_auth_failed | password 不一致を 401 にする |
| AUTH_LOGIN-TC-06 | sec_auth_login_internal_error | 内部例外を 500 にする |
| AUTH_LOGIN-TC-07 | sec_auth_login_success_totp_required | TOTP 有効ユーザーに challengeId を返す |
| AUTH_LOGIN-TC-08 | sec_auth_login_locked | lockUntil が未来なら拒否する |

---

## 2. テストケース詳細

## AUTH_LOGIN-TC-01 正常ログイン（TOTP 無効ユーザー）

- 対応 sec_id:
  - sec_auth_login_success_basic
- 条件:
  - 正しい userId/password
  - 対象ユーザーの TOTP 無効（totpEnabled = false）
- 期待:
  - ステータス: 200
  - Body:
    - ok:true
  - Cookie:
    - ログイン用 Cookie 設定あり（Set-Cookie ヘッダーあり）

---

## AUTH_LOGIN-TC-02 パラメータ不足

- 対応 sec_id:
  - sec_auth_login_invalid_request
- 条件:
  - userId 未指定
  - または password 未指定
- 期待:
  - ステータス: 400
  - Body: error = invalid_request

---

## AUTH_LOGIN-TC-03 body 不正

- 対応 sec_id:
  - sec_auth_login_invalid_request
- 条件:
  - body が null
  - body が object ではない
  - JSON パース不正
- 期待:
  - ステータス: 400
  - Body: error = invalid_request

---

## AUTH_LOGIN-TC-04 認証失敗（userId 不一致）

- 対応 sec_id:
  - sec_auth_login_auth_failed
  - sec_auth_login_security
- 条件:
  - 登録されていない userId
  - 任意の password
- 期待:
  - ステータス: 401
  - Body: error = auth_failed
  - 「登録されていない」ことを特定できる情報は返さない

---

## AUTH_LOGIN-TC-05 認証失敗（パスワード不一致）

- 対応 sec_id:
  - sec_auth_login_auth_failed
  - sec_auth_login_security
- 条件:
  - 登録済み userId
  - 誤った password
- 期待:
  - ステータス: 401
  - Body: error = auth_failed
  - 「パスワード不一致」であることを特定できる情報は返さない

---

## AUTH_LOGIN-TC-06 内部例外

- 対応 sec_id:
  - sec_auth_login_internal_error
- 条件:
  - prisma などの内部処理が例外を投げる
- 期待:
  - ステータス: 500
  - Body: error = internal_error

---

## AUTH_LOGIN-TC-07 TOTP 必須ユーザー（TOTP 有効）

- 対応 sec_id:
  - sec_auth_login_success_totp_required
- 条件:
  - 正しい userId/password
  - 対象ユーザーの TOTP 有効（totpEnabled = true）
- 期待:
  - ステータス: 200
  - Body:
    - ok:true
    - totpRequired:true
    - challengeId が返る
  - Cookie:
    - ログイン完了用 Cookie を発行しない

---

## AUTH_LOGIN-TC-08 lockUntil による拒否

- 対応 sec_id:
  - sec_auth_login_locked
- 条件:
  - lockUntil が未来
- 期待:
  - ステータス: 401（または実装により 429）
  - Body:
    - locked 系エラー

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン（POST /api/auth/login）
