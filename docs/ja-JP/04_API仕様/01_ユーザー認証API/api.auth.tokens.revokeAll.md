[目次](../../目次.md) > API仕様 > ユーザー認証API > 全トークン失効（POST /api/auth/tokens/revokeAll）

# 全トークン失効（POST /api/auth/tokens/revokeAll）

本書は、全トークン失効 API（POST /api/auth/tokens/revokeAll）の正式な仕様を定義する。  
※現時点の実装（apps/web/src/app/api/auth/tokens/revokeAll/route.ts）を正とする。

## 1. 概要

ログイン中ユーザーの SyncToken を全削除（全失効）する。

- 要ログイン
- 成功時は 204 No Content
- **Content-Type: application/json を必須**（現行実装）

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/tokens/revokeAll |

## 3. リクエスト

### 3.1 認可

- 要ログイン（requireUserId）

### 3.2 ヘッダー

- Content-Type: application/json（必須）

### 3.3 ボディ

- なし（ただし Content-Type は必須）

## 4. レスポンス

### 4.1 成功（204 No Content）

- ボディなし

### 4.2 失敗

#### 400 Bad Request（Content-Type 不正）

```json
{ "error": "bad_request" }
```

#### 401 Unauthorized（未ログイン）

- 既定エラー応答

#### 500 Internal Server Error

- prisma 例外など（既定エラー応答）

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > 全トークン失効（POST /api/auth/tokens/revokeAll）
