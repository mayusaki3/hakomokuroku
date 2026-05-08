[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン（POST /api/auth/login）

# ログイン（POST /api/auth/login）

ユーザーの資格情報を検証し、通常ログインまたは TOTP ログインフローへ分岐する API。

---

## 1. 概要

ログインフォームから送信された `userId` と `password` を検証し、以下のいずれかで成功レスポンスを返す。

1. **通常ユーザー（TOTP 無効）**: セッション Cookie を発行し、ログインを完了する
2. **TOTP 必須ユーザー（TOTP 有効）**: セッション Cookie を発行せず、TOTP ログイン確認用の `challengeId` を返す

クライアントは `totpRequired: true` を受け取った場合、`challengeId` と TOTP コードまたはリカバリコードを `/api/auth/login/totp` に送信する。

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_login_request_body | リクエスト本文 | `userId` と `password` を受け取る |
| sec_auth_login_invalid_request | 不正リクエスト | Content-Type / JSON / body / 必須項目不正を 400 にする |
| sec_auth_login_success_basic | 通常ログイン成功 | TOTP 無効ユーザーで 200 + ok:true + Cookie を返す |
| sec_auth_login_success_totp_required | TOTP 必須 | TOTP 有効ユーザーで 200 + totpRequired:true + challengeId を返す |
| sec_auth_login_auth_failed | 認証失敗 | userId 不明 / password 不一致を 401 にする |
| sec_auth_login_locked | ロック中 | lockUntil が未来なら 401 を返す |
| sec_auth_login_internal_error | 内部エラー | 予期しない例外を 500 にする |
| sec_auth_login_security | セキュリティ | 認証失敗理由を詳細化しない |

---

## 3. リクエスト

### 3.1 Body(JSON) {#sec_auth_login_request_body}

```json
{
  "userId": "string",
  "password": "string"
}
```

### 3.2 バリデーション {#sec_auth_login_invalid_request}

| 項目 | 条件 |
|---|---|
| Content-Type | `application/json` を含むこと |
| body | `null` ではなく object であること |
| userId | 必須・1文字以上の文字列 |
| password | 必須・1文字以上の文字列 |

不正な場合は `400 invalid_request` を返す。

---

## 4. レスポンス

### 4.1 共通事項

- Body は JSON
- 成功時は `ok: true`
- 失敗時は `ok: false`
- エラー時のフォーマットは共通仕様（`00_共通仕様.md`）の方針に従う

---

### 4.2 成功時（200）: 通常ユーザー（TOTP 無効） {#sec_auth_login_success_basic}

```json
{
  "ok": true
}
```

振る舞い:

- サーバー側でログイン用 Cookie を発行する
- レスポンスヘッダーの `Set-Cookie` にセッションまたはログイントークンを設定する
- TOTP チャレンジは作成しない

---

### 4.3 成功時（200）: TOTP 必須ユーザー（TOTP 有効） {#sec_auth_login_success_totp_required}

```json
{
  "ok": true,
  "totpRequired": true,
  "challengeId": "string"
}
```

振る舞い:

- サーバー側で `LoginChallenge` を作成する
- 作成した `LoginChallenge.id` を `challengeId` として返す
- このレスポンスではログイン完了用 Cookie を発行しない
- クライアントは `/api/auth/login/totp` に `challengeId` と TOTP コードまたはリカバリコードを送信する

---

### 4.4 失敗時

| sec_id | 状況 | ステータス | Body 例 |
|---|---|---:|---|
| sec_auth_login_invalid_request | Content-Type 不正 | 400 | `{ "ok": false, "error": "invalid_request" }` |
| sec_auth_login_invalid_request | JSON パース不正 | 400 | `{ "ok": false, "error": "invalid_request" }` |
| sec_auth_login_invalid_request | body が null / 非 object | 400 | `{ "ok": false, "error": "invalid_request" }` |
| sec_auth_login_invalid_request | userId / password 不足 | 400 | `{ "ok": false, "error": "invalid_request" }` |
| sec_auth_login_auth_failed | userId 不明 | 401 | `{ "ok": false, "error": "auth_failed" }` |
| sec_auth_login_auth_failed | パスワード不一致 | 401 | `{ "ok": false, "error": "auth_failed" }` |
| sec_auth_login_locked | lockUntil が未来 | 401 | `{ "ok": false, "error": "locked" }` |
| sec_auth_login_internal_error | 内部エラー | 500 | `{ "ok": false, "error": "internal_error" }` |

ユーザー不明とパスワード不一致は、レスポンス上は区別しない。

---

## 5. DB 更新仕様

### 5.1 通常ログイン成功時 {#sec_auth_login_success_basic}

- ログイン用 Cookie または同期トークンを発行する
- 必要に応じて最終ログイン日時を更新する

### 5.2 TOTP 必須ユーザー成功時 {#sec_auth_login_success_totp_required}

- `LoginChallenge` を作成する
- `LoginChallenge` には以下を含める
  - 対象ユーザー ID
  - 有効期限
  - 使用済みフラグ `used=false`

### 5.3 認証失敗時 {#sec_auth_login_auth_failed}

- 必要に応じて失敗回数やロック状態を更新する
- 詳細な失敗理由はクライアントへ返さない

---

## 6. セキュリティ注意点 {#sec_auth_login_security}

- ログにはパスワードを記録しない
- 認証失敗時のメッセージは詳細化しない
- TOTP 必須ユーザーに対しては、TOTP 完了前にログイン完了用 Cookie を発行しない
- `challengeId` は推測困難な値とし、短い有効期限を設ける
- `LoginChallenge` は 1 回限り使用可能とする

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン（POST /api/auth/login）
