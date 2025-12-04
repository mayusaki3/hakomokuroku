[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）

# TOTP有効化確認（POST /api/auth/totp/verify）

## 概要

/api/auth/totp/setup 実行後に、ユーザーが認証アプリから取得した TOTP コードを送信し、  
コードが正しければ TOTP を有効化する API。

## エンドポイント

- Method: POST  
- Path: /api/auth/totp/verify

## 認可

- 要ログイン

## リクエスト

### ヘッダー

- Authorization: Bearer \<token\>（必須）
- Content-Type: application/json（必須）

### ボディ

```json
{
  "code": "123456"
}
```

- code（必須）  
  - TOTP 認証アプリが生成した 6 桁コード（文字列）

## レスポンス

### 正常系（200 OK）

```json
{
  "enabled": true,
  "recoveryCodes": [
    "ABCD-1234",
    "EFGH-5678"
  ]
}
```

- enabled  
  - 有効化完了後は true
- recoveryCodes  
  - 発行された回復コード一覧  
  - 回復コードを運用しない場合は省略してよい

### 異常系

- 400 Bad Request  
  - code 未指定、空文字、6 桁以外など
- 401 Unauthorized  
  - ログインしていない／トークン無効
- 409 Conflict  
  - setup がまだ実行されていない、または既に TOTP 有効化済み
- 422 Unprocessable Entity  
  - code は形式としては正しいが、検証に失敗した場合（不正／期限切れ）
- 500 Internal Server Error  

エラーレスポンス形式は共通仕様に従う。

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）
