[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン一覧取得（GET /api/auth/tokens）

# トークン一覧取得（GET /api/auth/tokens）

本書は、トークン一覧取得 API（GET /api/auth/tokens）の正式な仕様を定義する。  

## 1. 概要

ログイン中ユーザーの SyncToken 一覧を返す。

- 要ログイン（セッションCookieにより認証）
- 成功時はトークン配列（JSON）を返す

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| GET | /api/auth/tokens |

## 3. リクエスト

### 3.1 認可

- 要ログイン（requireUserId）

### 3.2 ヘッダー

- Accept: application/json（任意）
  - JSON レスポンスを期待する場合に指定してよい

### 3.3 ボディ

- なし

## 4. レスポンス

### 4.1 成功（200）

```json
[
  {
    "id": "tok_1",
    "label": "default",
    "createdAt": "2025-12-01T00:00:00.000Z",
    "lastUsedAt": null,
    "expiresAt": "2026-01-01T00:00:00.000Z"
  }
]
```

- 配列の要素は SyncToken の一部フィールドのみ
  - id, label, createdAt, lastUsedAt, expiresAt

### 4.2 失敗

#### 401 Unauthorized（未ログイン）

- requireUserId が例外を投げる（既定エラー応答）

#### 500 Internal Server Error

- prisma 例外など（既定エラー応答）

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン一覧取得（GET /api/auth/tokens）
