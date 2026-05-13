<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-102000Z-ATKR
lang: ja-JP
canonical_title: トークン失効（POST /api/auth/tokens/revoke）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）

# トークン失効（POST /api/auth/tokens/revoke）

本書は、トークン失効 API（POST /api/auth/tokens/revoke）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/tokens/revoke/route.ts）および Vitest（apps/web/tests/api.auth.tokens.revoke.spec.ts）を正とする。

---

## 1. 概要

指定した SyncToken レコードを 1 件削除し、同期用トークンを失効させる API。

- 要ログイン
- 自分自身が発行したトークンのみ失効可能
- 指定には `SyncToken.id` を使用する
- 成功時は 204 No Content
- 対象トークンが存在しない、または他人のトークンの場合は 404
- Content-Type は application/json 必須

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_tokens_revoke_require_user | 認証要求 | requireUserId によりログインユーザーを取得する |
| sec_auth_tokens_revoke_content_type | Content-Type 検証 | application/json 以外または未指定を 400 にする |
| sec_auth_tokens_revoke_invalid_request | 入力不正 | JSON 不正、body 不正、id 未指定/非 string/空文字を 400 にする |
| sec_auth_tokens_revoke_find_token | 対象検索 | SyncToken.id で対象トークンを検索する |
| sec_auth_tokens_revoke_not_found | 対象なし | 不存在を 404 にする |
| sec_auth_tokens_revoke_security | 他ユーザー秘匿 | userId 不一致も 404 にする |
| sec_auth_tokens_revoke_success | 失効成功 | 対象トークンを削除し 204 を返す |
| sec_auth_tokens_revoke_internal_error | 内部エラー | findUnique/delete 例外を 500 にする |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/tokens/revoke |

---

## 4. リクエスト

### 4.1 認証 {#sec_auth_tokens_revoke_require_user}

- `requireUserId(req)` によりログイン中ユーザーIDを取得する
- 現実装ではこの呼び出しは try/catch 外にある

### 4.2 ヘッダー {#sec_auth_tokens_revoke_content_type}

```txt
Content-Type: application/json
```

- `application/json` に一致しない場合は 400
- ヘッダー未指定の場合も 400

### 4.3 Body(JSON) {#sec_auth_tokens_revoke_invalid_request}

```json
{
  "id": "T1"
}
```

| 項目 | 必須 | 条件 |
|---|---|---|
| id | 必須 | string かつ trim 後 1 文字以上 |

- JSON parse 失敗は 400
- body が null / object 以外の場合は 400
- `id` 未指定、非 string、空文字は 400
- 平文トークン値は使用しない

---

## 5. レスポンス

### 5.1 正常 {#sec_auth_tokens_revoke_success}

- HTTP 204
- Body なし

### 5.2 Content-Type 不正 / 入力不正 {#sec_auth_tokens_revoke_invalid_request}

```json
{
  "error": "bad_request"
}
```

- HTTP 400

### 5.3 対象なし / 他ユーザー {#sec_auth_tokens_revoke_not_found}

```json
{
  "error": "not_found"
}
```

- HTTP 404
- 対象トークンが存在しない場合
- 対象トークンの `userId` がログインユーザーIDと一致しない場合

### 5.4 内部エラー {#sec_auth_tokens_revoke_internal_error}

- HTTP 500
- Body なし

---

## 6. DB アクセス

### 6.1 対象検索 {#sec_auth_tokens_revoke_find_token}

```ts
await prisma.syncToken.findUnique({
  where: { id },
  select: { id: true, userId: true },
});
```

### 6.2 削除 {#sec_auth_tokens_revoke_success}

```ts
await prisma.syncToken.delete({ where: { id } });
```

---

## 7. セキュリティ・設計上の注意 {#sec_auth_tokens_revoke_security}

- 他ユーザーのトークン指定時も 404 を返し、存在有無と所有者情報を秘匿する
- 平文トークンは API で受け取らない
- CSRF 簡易対策として JSON Content-Type を必須にする

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）
