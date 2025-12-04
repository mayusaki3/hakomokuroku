[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP無効化（POST /api/auth/totp/disable）

# TOTP無効化（POST /api/auth/totp/disable）

## 概要

ログイン済みユーザーが、自身のアカウントから TOTP 設定を解除する API。  
セキュリティ上、TOTP コードまたは回復コードによる再認証を要求する。

## エンドポイント

- Method: POST  
- Path: /api/auth/totp/disable

## 認可

- 要ログイン

## リクエスト

### ヘッダー

- Authorization: Bearer \<token\>（必須）
- Content-Type: application/json（必須）

### ボディ

```json
{
  "code": "123456",
  "recoveryCode": "ABCD-1234"
}
```

- code（任意）: 現在の TOTP コード
- recoveryCode（任意）: 回復コード  
- code と recoveryCode の少なくとも一方は必須（両方指定も可）

## レスポンス

### 正常系（200 OK）

```json
{
  "enabled": false
}
```

- enabled  
  - 無効化完了後は false

### 異常系

- 400 Bad Request  
  - code / recoveryCode が両方とも未指定
- 401 Unauthorized  
  - ログインしていない／トークン無効
- 403 Forbidden  
  - code / recoveryCode が不正で無効化が拒否された場合
- 409 Conflict  
  - 元々 TOTP が有効化されていないユーザーが呼び出した場合
- 500 Internal Server Error  

エラーレスポンス形式は共通仕様に従う。

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP無効化（POST /api/auth/totp/disable）
