<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-103000Z-ATKA
lang: ja-JP
canonical_title: 全トークン失効（POST /api/auth/tokens/revokeAll）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > 全トークン失効（POST /api/auth/tokens/revokeAll）

# 全トークン失効（POST /api/auth/tokens/revokeAll）

本書は、全トークン失効 API（POST /api/auth/tokens/revokeAll）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/tokens/revokeAll/route.ts）および Vitest（apps/web/tests/api.auth.tokens.revokeAll.spec.ts）を正とする。

---

## 1. 概要

ログイン中ユーザーが保持するすべての SyncToken を削除する API。

- 要ログイン
- 成功時は 204 No Content
- `Content-Type: application/json` 必須
- 対象はログイン中ユーザー自身のトークンのみ
- `requireUserId` 例外は route 内で捕捉せず、そのまま throw する

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_tokens_revoke_all_require_user | 認証要求 | requireUserId によりログインユーザーを取得する |
| sec_auth_tokens_revoke_all_auth_error_passthrough | 認証例外 | requireUserId 例外は捕捉せず throw する |
| sec_auth_tokens_revoke_all_content_type | Content-Type 検証 | application/json 以外または未指定を 400 にする |
| sec_auth_tokens_revoke_all_success | 全失効成功 | ログインユーザーの SyncToken を deleteMany し 204 を返す |
| sec_auth_tokens_revoke_all_security | 対象ユーザー制限 | deleteMany.where.userId をログインユーザーに限定する |
| sec_auth_tokens_revoke_all_internal_error | 内部エラー | deleteMany 例外を 500 にする |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/tokens/revokeAll |

---

## 4. リクエスト

### 4.1 認証 {#sec_auth_tokens_revoke_all_require_user}

```ts
const uid = await requireUserId(req);
```

- `requireUserId` は Content-Type 検証より先に呼び出される
- `requireUserId` が例外を throw した場合、現実装ではこの API 内では捕捉しない

### 4.2 ヘッダー {#sec_auth_tokens_revoke_all_content_type}

```txt
Content-Type: application/json
```

- `application/json` に一致しない場合は 400
- ヘッダー未指定の場合も 400

### 4.3 Body

- 実装上、body の内容は使用しない
- テストでは `{}` を送信している

---

## 5. レスポンス

### 5.1 正常 {#sec_auth_tokens_revoke_all_success}

- HTTP 204
- Body なし

### 5.2 Content-Type 不正 {#sec_auth_tokens_revoke_all_content_type}

```json
{
  "error": "bad_request"
}
```

- HTTP 400

### 5.3 認証例外 {#sec_auth_tokens_revoke_all_auth_error_passthrough}

- `requireUserId` が throw した例外をそのまま throw する
- route 内で 401 レスポンスへ変換しない

### 5.4 内部エラー {#sec_auth_tokens_revoke_all_internal_error}

- HTTP 500
- Body なし

---

## 6. DB アクセス

### 6.1 全失効 {#sec_auth_tokens_revoke_all_success}

```ts
await prisma.syncToken.deleteMany({
  where: { userId: uid },
});
```

### 6.2 対象ユーザー制限 {#sec_auth_tokens_revoke_all_security}

- `where.userId` は必ず `requireUserId` で取得したログインユーザーIDに限定する
- 他ユーザーの SyncToken を削除してはならない

---

## 7. 設計上の注意 {#sec_auth_tokens_revoke_all_security}

- 本 API は「全端末からログアウト」用途を想定する
- 他ユーザーのトークンに影響を与えない
- CSRF 簡易対策として JSON Content-Type を必須にする
- 現実装では認証例外のレスポンス変換は共通層または呼び出し元の責務として扱う

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > 全トークン失効（POST /api/auth/tokens/revokeAll）
