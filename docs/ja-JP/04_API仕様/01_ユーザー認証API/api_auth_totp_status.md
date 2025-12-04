[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP状態取得（GET /api/auth/totp/status）

# TOTP状態取得（GET /api/auth/totp/status）

## 概要

ログイン済みユーザーに紐づく TOTP 設定の状態を取得する API。  
設定画面などで「TOTP 有効／無効」を表示するために使用する。

## エンドポイント

- Method: GET  
- Path: /api/auth/totp/status

## 認可

- 要ログイン

## リクエスト

### ヘッダー

- Authorization: Bearer \<token\>（必須）

### ボディ

なし。

## レスポンス

### 正常系（200 OK）

```json
{
  "enabled": true,
  "recoveryCodesRemaining": 5
}
```

- enabled  
  - TOTP が有効化済みであれば true、未設定または無効なら false
- recoveryCodesRemaining  
  - 残り回復コード数  
  - 回復コード機能を実装していない場合は null または省略してよい

### 異常系

- 401 Unauthorized  
  - ログインしていない／トークン無効
- 500 Internal Server Error  

エラーレスポンス形式は共通仕様に従う。

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP状態取得（GET /api/auth/totp/status）
