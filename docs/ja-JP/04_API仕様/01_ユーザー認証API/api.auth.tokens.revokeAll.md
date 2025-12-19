[目次](../../目次.md) > API仕様 > ユーザー認証API > 全トークン失効（POST /api/auth/tokens/revokeAll）

# 全トークン失効（POST /api/auth/tokens/revokeAll）

本書は、全トークン失効 API（POST /api/auth/tokens/revokeAll）の正式な仕様を定義する。  
※ **現時点の実装（apps/web/src/app/api/auth/tokens/revokeAll/route.ts）を正とする。**

## 1. 概要

ログイン中ユーザーが保持する **すべての SyncToken を削除（全失効）**する API。

- 要ログイン
- 成功時は **204 No Content**
- **Content-Type: application/json を必須**とする（CSRF 簡易対策）

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/tokens/revokeAll |

## 3. リクエスト

### 3.1 認可

- 要ログイン
- 認証方法：`requireUserId` による Cookie 認証

### 3.2 ヘッダー

| 項目 | 必須 | 説明 |
|------|------|------|
| Content-Type | 必須 | application/json |

### 3.3 ボディ

- **なし**
- ただし、ボディが空であっても Content-Type は必須

## 4. レスポンス

### 4.1 成功（204 No Content）

- ボディなし

### 4.2 失敗

#### 400 Bad Request

- Content-Type が application/json でない

```json
{ "error": "bad_request" }
```

#### 401 Unauthorized

- 未ログイン

（既定の認証エラー応答）

#### 500 Internal Server Error

- Prisma 例外などの内部エラー

（ボディなし）

## 5. 挙動仕様

1. Content-Type を検証  
   - application/json 以外は 400
2. Cookie 認証によりユーザー ID を取得  
   - 未ログインの場合は 401
3. 指定ユーザーの SyncToken をすべて削除
4. 204 No Content を返却

## 6. セキュリティ・設計上の注意

- 対象は **ログイン中ユーザー自身のトークンのみ**
- 他ユーザーのトークンに影響を与えることはない
- トークン削除後は、既存セッション・クライアントはすべて無効化される
- UI 側では「全端末からログアウト」用途を想定

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > 全トークン失効（POST /api/auth/tokens/revokeAll）
