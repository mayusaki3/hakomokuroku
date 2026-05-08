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

## 2. リクエスト

### Body(JSON)

```json
{
  "userId": "string",
  "password": "string"
}
```

### バリデーション

| 項目 | 条件 |
|---|---|
| userId | 必須・1文字以上の文字列 |
| password | 必須・1文字以上の文字列 |

`body` が `null`、または object ではない場合は `400 invalid_request` を返す。

---

## 3. レスポンス

### 3.1 共通事項

- Body は JSON
- 成功時は `ok: true`
- 失敗時は `ok: false`
- エラー時のフォーマットは共通仕様（`00_共通仕様.md`）の方針に従う

---

### 3.2 成功時（200）: 通常ユーザー（TOTP 無効）

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

### 3.3 成功時（200）: TOTP 必須ユーザー（TOTP 有効）

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

### 3.4 失敗時

| 状況 | ステータス | Body 例 |
|---|---:|---|
| Content-Type 不正 | 400 | `{ "ok": false, "error": "invalid_request" }` |
| JSON パース不正 | 400 | `{ "ok": false, "error": "invalid_request" }` |
| body が null / 非 object | 400 | `{ "ok": false, "error": "invalid_request" }` |
| userId / password 不足 | 400 | `{ "ok": false, "error": "invalid_request" }` |
| userId 不明 | 401 | `{ "ok": false, "error": "auth_failed" }` |
| パスワード不一致 | 401 | `{ "ok": false, "error": "auth_failed" }` |
| lockUntil が未来 | 401 | `{ "ok": false, "error": "locked" }` |
| 内部エラー | 500 | `{ "ok": false, "error": "internal_error" }` |

ユーザー不明とパスワード不一致は、レスポンス上は区別しない。

---

## 4. DB 更新仕様

### 4.1 通常ログイン成功時

- ログイン用 Cookie または同期トークンを発行する
- 必要に応じて最終ログイン日時を更新する

### 4.2 TOTP 必須ユーザー成功時

- `LoginChallenge` を作成する
- `LoginChallenge` には以下を含める
  - 対象ユーザー ID
  - 有効期限
  - 使用済みフラグ `used=false`

### 4.3 認証失敗時

- 必要に応じて失敗回数やロック状態を更新する
- 詳細な失敗理由はクライアントへ返さない

---

## 5. セキュリティ注意点

- ログにはパスワードを記録しない
- 認証失敗時のメッセージは詳細化しない
- TOTP 必須ユーザーに対しては、TOTP 完了前にログイン完了用 Cookie を発行しない
- `challengeId` は推測困難な値とし、短い有効期限を設ける
- `LoginChallenge` は 1 回限り使用可能とする

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン（POST /api/auth/login）
