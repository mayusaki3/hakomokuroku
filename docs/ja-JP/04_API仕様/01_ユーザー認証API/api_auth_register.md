<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-110000Z-AURE
lang: ja-JP
canonical_title: ユーザー登録（POST /api/auth/register）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > ユーザー登録（POST /api/auth/register）

# ユーザー登録（POST /api/auth/register）

本書は、ユーザー登録 API（POST /api/auth/register）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/register/route.ts）および Vitest（apps/web/tests/api.auth.register.spec.ts）を正とする。

---

## 1. 概要

未登録ユーザーを新規作成する API。

- 認証不要
- `Content-Type: application/json` 必須
- 成功時は 200 + `{ ok:true }`
- 既に同一 userId が存在する場合は 409
- 登録成功してもログイン状態にはしない
- セッション Cookie は発行しない
- password は argon2 で hash 化して保存する

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_register_request | リクエスト | userId と password を受け取る |
| sec_auth_register_content_type | Content-Type 検証 | application/json 以外または未指定を 400 にする |
| sec_auth_register_json_parse | JSON parse | JSON parse 失敗を 400 にする |
| sec_auth_register_user_id_validation | userId 検証 | userId 未指定/空/非string を 400 にする |
| sec_auth_register_password_validation | password 検証 | password 未指定/空/非string を 400 にする |
| sec_auth_register_trim_user_id | userId trim | userId は trim 後の値で判定・保存する |
| sec_auth_register_conflict | 既存ユーザー | userId 重複を 409 にする |
| sec_auth_register_success | 登録成功 | User を作成し 200 ok:true を返す |
| sec_auth_register_internal_error | 内部エラー | DB 例外などを 500 にする |
| sec_auth_register_security | セキュリティ | password をハッシュ化し、登録後ログイン状態にしない |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/register |

---

## 4. リクエスト

### 4.1 ヘッダー {#sec_auth_register_content_type}

```txt
Content-Type: application/json
```

- `application/json` を含まない場合は 400
- ヘッダー未指定の場合も 400

### 4.2 Body(JSON) {#sec_auth_register_request}

```json
{
  "userId": "string",
  "password": "string"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| userId | string | 必須 | ログイン用ID。trim 後空文字不可 |
| password | string | 必須 | 平文パスワード。空文字不可 |

### 4.3 JSON parse {#sec_auth_register_json_parse}

- JSON parse 失敗時は 400
- JSON として `null` が渡された場合も入力不正として 400

### 4.4 userId 検証 {#sec_auth_register_user_id_validation}

- `typeof userId !== 'string'` は 400
- `userId.trim().length === 0` は 400
- 以後の既存判定・保存には trim 後の値を使用する

### 4.5 password 検証 {#sec_auth_register_password_validation}

- `typeof password !== 'string'` は 400
- `password.length === 0` は 400
- password は trim しない

---

## 5. レスポンス

### 5.1 成功 {#sec_auth_register_success}

```json
{
  "ok": true
}
```

- HTTP 200
- 登録成功時もログイン用 Cookie を発行しない

### 5.2 入力不正

```json
{
  "ok": false,
  "error": "bad_request"
}
```

- HTTP 400
- Content-Type 不正
- JSON parse 不正
- body null
- userId 不正
- password 不正

### 5.3 重複 {#sec_auth_register_conflict}

```json
{
  "ok": false,
  "error": "already_exists"
}
```

- HTTP 409

### 5.4 内部エラー {#sec_auth_register_internal_error}

- HTTP 500
- Body なし

---

## 6. DB アクセス

### 6.1 既存確認 {#sec_auth_register_conflict}

```ts
await prisma.user.findFirst({
  where: { userId: userIdTrimmed },
});
```

### 6.2 User 作成 {#sec_auth_register_success}

```ts
await prisma.user.create({
  data: {
    userId: userIdTrimmed,
    passwordHash,
  },
});
```

- `passwordHash` は `argon2.hash(password)` の結果
- その他フィールドは Prisma schema の既定値に従う

---

## 7. セキュリティ {#sec_auth_register_security}

- password は平文保存しない
- passwordHash のみ保存する
- 登録成功してもログイン状態にはしない
- 既存 userId 判定では入力 userId を trim して扱う
- 保存する userId も trim 後の値とする

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > ユーザー登録（POST /api/auth/register）
