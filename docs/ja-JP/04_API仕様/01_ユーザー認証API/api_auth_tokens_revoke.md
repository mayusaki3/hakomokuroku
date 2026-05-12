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
- 指定には `SyncToken.id` を使用する

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_tokens_revoke_content_type | Content-Type 検証 | application/json 以外または未指定なら 400 |
| sec_auth_tokens_revoke_require_user | 認証要求 | requireUserId でログインユーザーを取得する |
| sec_auth_tokens_revoke_invalid_request | 入力不正 | JSON 不正または id 未指定を 400 にする |
| sec_auth_tokens_revoke_find_token | 対象検索 | SyncToken.id で対象トークンを検索する |
| sec_auth_tokens_revoke_not_found | 対象なし/他ユーザー | 不存在または userId 不一致を 404 にする |
| sec_auth_tokens_revoke_success | 失効成功 | 対象トークンを削除し 204 を返す |
| sec_auth_tokens_revoke_security | 秘匿 | 他ユーザーのトークン指定でも 404 にする |
| sec_auth_tokens_revoke_internal_error | 内部エラー | Prisma 例外などを 500 相当にする |

---

## 3. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/tokens/revoke |

---

## 4. 認可 {#sec_auth_tokens_revoke_require_user}

- 要ログイン
- 認証方法：`requireUserId` による Cookie 認証

---

## 5. リクエスト

### 5.1 ヘッダー {#sec_auth_tokens_revoke_content_type}

| 項目 | 必須 | 説明 |
|------|------|------|
| Content-Type | 必須 | application/json |

※ CSRF 簡易対策として JSON 必須

### 5.2 ボディ（JSON） {#sec_auth_tokens_revoke_invalid_request}

```json
{
  "id": "string"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | string | ✅ | 失効対象の SyncToken.id |

※ **平文トークン値は本 API では使用しない**

---

## 6. レスポンス

### 6.1 成功（204 No Content） {#sec_auth_tokens_revoke_success}

- ボディなし

### 6.2 失敗

| sec_id | 状況 | ステータス | Body |
|---|---|---:|---|
| sec_auth_tokens_revoke_content_type | Content-Type が application/json でない | 400 | `{ "error": "bad_request" }` |
| sec_auth_tokens_revoke_invalid_request | JSON 不正 | 400 | `{ "error": "bad_request" }` |
| sec_auth_tokens_revoke_invalid_request | id 未指定 | 400 | `{ "error": "bad_request" }` |
| sec_auth_tokens_revoke_not_found | 指定トークンが存在しない | 404 | `{ "error": "not_found" }` |
| sec_auth_tokens_revoke_not_found / sec_auth_tokens_revoke_security | 他ユーザーのトークン指定 | 404 | `{ "error": "not_found" }` |
| sec_auth_tokens_revoke_require_user | 未ログイン | 401 | 認証処理に従う |
| sec_auth_tokens_revoke_internal_error | Prisma 例外など | 500 | 実装に委ねる |

---

## 7. 挙動仕様

1. Cookie 認証によりユーザー ID を取得する
2. Content-Type を検証する
   - application/json 以外は 400
3. リクエストボディから `id` を取得する
   - 未指定の場合は 400
4. SyncToken を `id` で検索する
   - 存在しない場合は 404
   - userId がログインユーザーと一致しない場合も 404
5. 対象トークンを `id` で削除する
6. 204 No Content を返却する

---

## 8. DB アクセス

### 8.1 対象検索 {#sec_auth_tokens_revoke_find_token}

```ts
prisma.syncToken.findUnique({
  where: { id },
  select: { id: true, userId: true },
});
```

### 8.2 削除 {#sec_auth_tokens_revoke_success}

```ts
prisma.syncToken.delete({ where: { id } });
```

---

## 9. セキュリティ・設計上の注意 {#sec_auth_tokens_revoke_security}

- 他ユーザーのトークン指定時も 404 を返却し、存在有無を秘匿する
- 平文トークンは DB に保存せず、API でも受け取らない
- 一覧取得 API と組み合わせて使用することを想定する

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）
