[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）

# トークン失効（POST /api/auth/tokens/revoke）

本書は、トークン失効 API（POST /api/auth/tokens/revoke）の正式な仕様を定義する。  
※ **現時点の実装（apps/web/src/app/api/auth/tokens/revoke/route.ts）を正とする。**

## 1. 概要

指定した **SyncToken レコードを 1 件削除（失効）**する API。

- 要ログイン
- 自分自身が発行したトークンのみ失効可能
- 成功時は **204 No Content**
- 対象トークンが存在しない、または他人のトークンの場合は **404**

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/tokens/revoke |

## 3. 認可

- 要ログイン
- 認証方法：`requireUserId` による Cookie 認証

## 4. リクエスト

### 4.1 ヘッダー

| 項目 | 必須 | 説明 |
|------|------|------|
| Content-Type | 必須 | application/json |

※ CSRF 簡易対策として JSON 必須

### 4.2 ボディ（JSON）

```json
{
  "id": "xxxxxxxx"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | string | ✅ | 失効対象の SyncToken.id |

※ **平文トークン（token 値）は本 API では使用しない**

## 5. レスポンス

### 5.1 成功（204 No Content）

- ボディなし

### 5.2 失敗

#### 400 Bad Request

- Content-Type が application/json でない
- JSON 不正
- id 未指定

```json
{ "error": "bad_request" }
```

#### 404 Not Found

- 指定したトークンが存在しない
- 他ユーザーのトークンを指定した場合  
  （※ 権限有無を推測させないため同一応答）

```json
{ "error": "not_found" }
```

#### 401 Unauthorized

- 未ログイン

（既定の認証エラー応答）

#### 500 Internal Server Error

- Prisma 例外などの内部エラー

（ボディなし）

## 6. 挙動仕様

1. Content-Type を検証  
   - application/json 以外は 400
2. Cookie 認証によりユーザー ID を取得  
   - 未ログインの場合は 401
3. リクエストボディから `id` を取得  
   - 未指定の場合は 400
4. SyncToken を検索  
   - 存在しない、または userId が不一致の場合は 404
5. 対象トークンを削除
6. 204 No Content を返却

## 7. セキュリティ・設計上の注意

- 他ユーザーのトークン指定時も 404 を返却し、存在有無を秘匿する
- 平文トークンは DB に保存せず、API でも受け取らない
- 一覧取得 API と組み合わせて使用することを想定

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）
