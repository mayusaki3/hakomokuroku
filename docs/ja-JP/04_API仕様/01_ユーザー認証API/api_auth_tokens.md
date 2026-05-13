<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-101000Z-ATOK
lang: ja-JP
canonical_title: トークン一覧取得（GET /api/auth/tokens）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン一覧取得（GET /api/auth/tokens）

# トークン一覧取得（GET /api/auth/tokens）

本書は、トークン一覧取得 API（GET /api/auth/tokens）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/tokens/route.ts）および Vitest（apps/web/tests/api.auth.tokens.spec.ts）を正とする。

---

## 1. 概要

ログイン中ユーザーの SyncToken 一覧を返す API。

- 要ログイン
- GET だが、現行実装では `Content-Type: application/json` を要求する
- 成功時は `syncToken.findMany()` の結果配列を返す
- 0件でも 200 + `[]` を返す
- DB例外は body なし 500 を返す

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_tokens_content_type | Content-Type 検証 | application/json 以外または未指定を 400 にする |
| sec_auth_tokens_require_user | 認証要求 | requireUserId により userId を取得する |
| sec_auth_tokens_unauthorized | 未ログイン | status なし/401 例外を 401 にする |
| sec_auth_tokens_forbidden | 認可エラー | status 付き認可エラーをその status で返す |
| sec_auth_tokens_success | 一覧取得成功 | ログイン中ユーザーのトークン一覧を 200 で返す |
| sec_auth_tokens_empty | 空配列成功 | 0件でも 200 + [] を返す |
| sec_auth_tokens_db_error | DB例外 | findMany 例外を 500 にする |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| GET | /api/auth/tokens |

---

## 4. リクエスト

### 4.1 ヘッダー {#sec_auth_tokens_content_type}

```txt
Content-Type: application/json
```

- `application/json` を含まない場合は 400
- ヘッダー未指定の場合も 400

### 4.2 認証 {#sec_auth_tokens_require_user}

- `requireUserId()` によりログイン中ユーザーIDを取得する

---

## 5. レスポンス

### 5.1 正常 {#sec_auth_tokens_success}

```json
[
  {
    "tokenHash": "string",
    "issuedAt": "2026-01-01T00:00:00.000Z",
    "expiresAt": "2026-02-01T00:00:00.000Z",
    "lastUsedAt": null,
    "deviceName": "string",
    "userAgent": "string",
    "ip": "string"
  }
]
```

- HTTP 200
- `prisma.syncToken.findMany()` の select 結果をそのまま返す

### 5.2 空配列 {#sec_auth_tokens_empty}

```json
[]
```

- HTTP 200

### 5.3 Content-Type 不正 {#sec_auth_tokens_content_type}

```json
{
  "error": "bad_request"
}
```

- HTTP 400

### 5.4 未ログイン {#sec_auth_tokens_unauthorized}

```json
{
  "error": "unauthorized"
}
```

- HTTP 401

### 5.5 認可エラー {#sec_auth_tokens_forbidden}

```json
{
  "error": "unauthorized"
}
```

- HTTP status は `requireUserId()` 例外の `status` を使用する
- 例: status=403 の場合は HTTP 403

### 5.6 DB例外 {#sec_auth_tokens_db_error}

- HTTP 500
- Body なし

---

## 6. DBアクセス {#sec_auth_tokens_success}

```ts
await prisma.syncToken.findMany({
  where: { userId },
  orderBy: { issuedAt: 'desc' },
  select: {
    tokenHash: true,
    issuedAt: true,
    expiresAt: true,
    lastUsedAt: true,
    deviceName: true,
    userAgent: true,
    ip: true,
  },
});
```

---

## 7. 設計上の注意

- 本 API は GET だが、現実装では Content-Type を検証する
- 認可エラー時の body は `unauthorized` 固定だが、HTTP status は例外由来の値を使用する
- トークンがない状態は正常系として扱う

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン一覧取得（GET /api/auth/tokens）
