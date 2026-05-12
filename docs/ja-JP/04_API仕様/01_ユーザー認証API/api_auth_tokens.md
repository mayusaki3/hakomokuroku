[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン一覧取得（GET /api/auth/tokens）

# トークン一覧取得（GET /api/auth/tokens）

本書は、トークン一覧取得 API（GET /api/auth/tokens）の正式な仕様を定義する。

---

## 1. 概要

ログイン中ユーザーの SyncToken 一覧を返す。

- 要ログイン（requireUserId により認証）
- Content-Type は application/json を要求する（現行実装・Vitest 準拠）
- 成功時はトークン配列（JSON）を返す
- トークンが 0 件の場合も 200 + 空配列を返す

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_tokens_content_type | Content-Type 検証 | application/json 以外または未指定なら 400 |
| sec_auth_tokens_require_user | 認証要求 | requireUserId を呼び出す |
| sec_auth_tokens_success | 一覧取得成功 | ログイン中ユーザーのトークン一覧を 200 で返す |
| sec_auth_tokens_empty | 空配列成功 | トークン 0 件でも 200 + [] を返す |
| sec_auth_tokens_unauthorized | 未ログイン | requireUserId の status なし/401 例外を 401 として返す |
| sec_auth_tokens_forbidden | 認可エラー | requireUserId の status 付き例外をそのまま返す |
| sec_auth_tokens_db_error | DB 例外 | findMany 例外時に 500 を返す |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| GET | /api/auth/tokens |

---

## 4. リクエスト

### 4.1 認可 {#sec_auth_tokens_require_user}

- 要ログイン
- `requireUserId` によりユーザー ID を取得する

### 4.2 ヘッダー {#sec_auth_tokens_content_type}

```txt
Content-Type: application/json
```

現行実装では GET であっても Content-Type を確認する。

- `application/json` を含まない場合は 400
- ヘッダー未指定の場合も 400

### 4.3 ボディ

なし。

---

## 5. レスポンス

### 5.1 成功（200） {#sec_auth_tokens_success}

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

現行実装は `prisma.syncToken.findMany` の select 結果をそのまま返す。

### 5.2 成功（空配列） {#sec_auth_tokens_empty}

```json
[]
```

トークンが 0 件でもエラーにしない。

---

## 6. エラーレスポンス

### 6.1 Content-Type 不正（400） {#sec_auth_tokens_content_type}

```json
{ "error": "bad_request" }
```

### 6.2 未ログイン（401） {#sec_auth_tokens_unauthorized}

```json
{ "error": "unauthorized" }
```

`requireUserId` が status なし例外を投げた場合も 401 とする。

### 6.3 認可エラー（403 など） {#sec_auth_tokens_forbidden}

```json
{ "error": "unauthorized" }
```

`requireUserId` が `status` を持つ例外を投げた場合、その status をレスポンスに使用する。

### 6.4 DB 例外（500） {#sec_auth_tokens_db_error}

本文なしの 500 を返す。

---

## 7. DB アクセス

### 7.1 SyncToken 一覧取得 {#sec_auth_tokens_success}

`prisma.syncToken.findMany` を使用する。

```ts
where: { userId }
orderBy: { issuedAt: 'desc' }
select: {
  tokenHash: true,
  issuedAt: true,
  expiresAt: true,
  lastUsedAt: true,
  deviceName: true,
  userAgent: true,
  ip: true,
}
```

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > トークン一覧取得（GET /api/auth/tokens）
