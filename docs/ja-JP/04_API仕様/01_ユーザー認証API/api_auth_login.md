<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-085000Z-AULG
lang: ja-JP
canonical_title: ログイン（POST /api/auth/login）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン（POST /api/auth/login）

# ログイン（POST /api/auth/login）

本書は、ログイン API（POST /api/auth/login）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/login/route.ts）および Vitest（apps/web/tests/api.auth.login.spec.ts）を正とする。

---

## 1. 概要

ログインフォームから送信された `userId` と `password` を検証し、正しい場合はログイン Cookie を返す API。

- `Content-Type: application/json` のみ受け付ける
- JSON body は object でなければならない
- `userId` と `password` は空白のみではない文字列でなければならない
- ユーザー不明、パスワード不一致、ロック中はいずれも 401 とする
- 成功時は `Set-Cookie` で `sid` を返す

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_login_invalid_request | 不正リクエスト | Content-Type / JSON / body / 必須項目不正を 400 にする |
| sec_auth_login_request_body | リクエスト本文 | `userId` と `password` を受け取る |
| sec_auth_login_user_lookup | ユーザー検索 | `prisma.user.findUnique({ where: { userId } })` でユーザーを検索する |
| sec_auth_login_auth_failed | 認証失敗 | userId 不明 / password 不一致を 401 にする |
| sec_auth_login_locked | ロック中 | lockUntil が未来なら 401 にする |
| sec_auth_login_success_basic | ログイン成功 | 200 + ok:true + Set-Cookie を返す |
| sec_auth_login_security | セキュリティ | 認証失敗理由を詳細化しない |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/login |

---

## 4. リクエスト

### 4.1 Body(JSON) {#sec_auth_login_request_body}

```json
{
  "userId": "string",
  "password": "string"
}
```

### 4.2 バリデーション {#sec_auth_login_invalid_request}

| 項目 | 条件 | 不正時 |
|---|---|---|
| Content-Type | `application/json` を含むこと | 400 invalid_request |
| JSON | `req.json()` が成功すること | 400 invalid_request |
| body | `null` ではなく object であること | 400 invalid_request |
| userId | 必須・空白のみではない文字列 | 400 invalid_request |
| password | 必須・空白のみではない文字列 | 400 invalid_request |

---

## 5. レスポンス

### 5.1 成功 {#sec_auth_login_success_basic}

```json
{
  "ok": true
}
```

- HTTP 200
- `Set-Cookie` に `sid` を含める

### 5.2 不正リクエスト {#sec_auth_login_invalid_request}

```json
{
  "ok": false,
  "error": "invalid_request"
}
```

- HTTP 400

### 5.3 認証失敗 {#sec_auth_login_auth_failed}

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

- HTTP 401
- ユーザー不明とパスワード不一致をレスポンス上で区別しない

### 5.4 ロック中 {#sec_auth_login_locked}

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

- HTTP 401
- `lockUntil` が未来の場合に返す
- ロック理由をレスポンス上で詳細化しない

---

## 6. 処理仕様

### 6.1 ユーザー検索 {#sec_auth_login_user_lookup}

```ts
await prisma.user.findUnique({
  where: { userId },
});
```

- `userId` は trim 後の値を使用する
- ユーザーが存在しない場合は 401 を返す

### 6.2 ロック判定 {#sec_auth_login_locked}

- `lockUntil` が `Date` であり、かつ現在時刻より未来の場合は 401 を返す
- `lockUntil` が `null` または未設定の場合はロックなしとする

### 6.3 パスワード検証 {#sec_auth_login_auth_failed}

- `passwordHash` が存在しない場合は 401 を返す
- `verifyPassword(password, passwordHash)` が false の場合は 401 を返す

### 6.4 Cookie 発行 {#sec_auth_login_success_basic}

- 成功時のみ `Set-Cookie` を返す
- 現実装では `sid=dummy; Path=/; HttpOnly; SameSite=Lax` を返す

---

## 7. セキュリティ注意点 {#sec_auth_login_security}

- レスポンスにパスワードを含めてはならない
- 認証失敗理由を詳細化してはならない
- ユーザー不明とパスワード不一致を区別できる情報を返してはならない
- ロック中も詳細なロック理由を返してはならない

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン（POST /api/auth/login）
