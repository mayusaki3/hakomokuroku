[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTPログイン確認（POST /api/auth/login/totp）

# TOTPログイン確認（POST /api/auth/login/totp）

## 概要

パスワード認証は成功したが、TOTP が有効なユーザーに対して、  
二段階認証の最終ステップとして TOTP コード（または回復コード）を検証し、  
成功時にアクセストークンを発行する API。

/api/auth/login で TOTP 必須ユーザーに対して発行された一時的な loginId を使用する。

## エンドポイント

- Method: POST  
- Path: /api/auth/login/totp

## 認可

- Authorization ヘッダーは不要  
- 代わりに loginId を用いた一時ログインセッションで識別する

## リクエスト

### ヘッダー

- Content-Type: application/json（必須）

### ボディ

```json
{
  "loginId": "uuid-or-random-id",
  "code": "123456",
  "recoveryCode": "ABCD-1234"
}
```

- loginId（必須）  
  - /api/auth/login 成功時に払い出された一時 ID
- code（任意）  
  - 6 桁 TOTP コード
- recoveryCode（任意）  
  - 回復コード  
- code と recoveryCode の少なくとも一方は必須

## レスポンス

### 正常系（200 OK）

```json
{
  "token": "jwt-or-access-token"
}
```

- token  
  - 以後の認証に使用するアクセストークン  
  - フロントエンドでは localStorage 等に保存して /api/auth/me などで使用する

### 異常系

- 400 Bad Request  
  - loginId 未指定
  - code / recoveryCode が両方とも未指定
- 404 Not Found  
  - loginId が存在しない、または有効期限切れ
- 409 Conflict  
  - 対象 loginId が TOTP チャレンジ状態ではない
- 422 Unprocessable Entity  
  - コード／回復コードの検証に失敗
- 500 Internal Server Error  

エラーレスポンス例:

```json
{
  "error": "invalid_totp",
  "message": "The TOTP code is invalid or expired."
}
```

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTPログイン確認（POST /api/auth/login/totp）
