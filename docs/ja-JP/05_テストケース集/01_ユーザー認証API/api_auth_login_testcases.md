[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン（POST /api/auth/login）

# テストケース：ログイン（POST /api/auth/login）

## AUTH_LOGIN-TC-01 正常ログイン（TOTP 無効ユーザー）

- 条件:
  - 正しい email/password
  - 対象ユーザーの TOTP 無効（totpEnabled = false）
- 期待:
  - ステータス: 200
  - Body:
    - ok:true
    - user.id が返る
  - Cookie:
    - セッション Cookie 設定あり（Set-Cookie ヘッダーにセッション ID）

---

## AUTH_LOGIN-TC-02 email 不正フォーマット

- 条件:
  - email: "abc"（メール形式ではない）
- 期待:
  - ステータス: 400
  - Body: error = "invalid_request"

---

## AUTH_LOGIN-TC-03 パラメータ不足

- 条件:
  - password 未指定
- 期待:
  - ステータス: 400
  - Body: error = "invalid_request"

---

## AUTH_LOGIN-TC-04 認証失敗（メール不一致）

- 条件:
  - 登録されていない email
  - 任意の password
- 期待:
  - ステータス: 401
  - Body: error = "auth_failed"
  - 「登録されていない」ことを特定できる情報は返さない

---

## AUTH_LOGIN-TC-05 認証失敗（パスワード不一致）

- 条件:
  - 登録済み email
  - 誤った password
- 期待:
  - ステータス: 401
  - Body: error = "auth_failed"
  - 「パスワード不一致」であることを特定できる情報は返さない

---

## AUTH_LOGIN-TC-06 内部例外

- 条件:
  - prisma などの内部処理が例外を投げる
- 期待:
  - ステータス: 500
  - Body: error = "internal_error"

---

## AUTH_LOGIN-TC-07 TOTP 必須ユーザー（TOTP 有効）

- 条件:
  - 正しい email/password
  - 対象ユーザーの TOTP 有効（totpEnabled = true）
- 期待:
  - ステータス: 200
  - Body:
    - ok:true
    - totpRequired:true
    - loginId が返る（UUID 形式または十分に長いランダム文字列）
    - user オブジェクトは返さない（仕様に従う）
  - Cookie:
    - セッション Cookie の設定なし（Set-Cookie ヘッダーにセッション ID が含まれない）
  - 備考:
    - loginId は `/api/auth/login/totp` で使用される一時 ID
    - 期限切れ・1 回限り利用などの制約は `/api/auth/login/totp` 側で検証

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン（POST /api/auth/login）
