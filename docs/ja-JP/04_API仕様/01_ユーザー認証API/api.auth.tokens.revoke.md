[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）

# トークン失効（POST /api/auth/tokens/revoke）

本書は、トークン失効 API（POST /api/auth/tokens/revoke）の正式な仕様を定義する。  
※現時点の実装（apps/web/src/app/api/auth/tokens/revoke/route.ts）を正とする。

## 1. 概要

指定トークン（SyncToken）を削除（失効）する。

- 要ログイン
- 成功時は 204 No Content
- 対象トークンが見つからない場合は 404

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/tokens/revoke |

## 3. リクエスト

### 3.1 認可

- 要ログイン（requireUserId）

### 3.2 ヘッダー

- Content-Type: application/json（必須）

### 3.3 ボディ（JSON）

```json
{ "token": "plain-token" }
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| token | string | ✅ | 失効対象トークン（平文） |

## 4. レスポンス

### 4.1 成功（204 No Content）

- ボディなし

### 4.2 失敗

#### 400 Bad Request（Content-Type 不正 / JSON不正 / token 不正）

```json
{ "error": "bad_request" }
```

#### 404 Not Found（対象トークンなし）

```json
{ "error": "not_found" }
```

#### 401 Unauthorized（未ログイン）

- 既定エラー応答

#### 500 Internal Server Error

- prisma 例外など（既定エラー応答）

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）
