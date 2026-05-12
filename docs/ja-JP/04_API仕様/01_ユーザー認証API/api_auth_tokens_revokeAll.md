[目次](../../目次.md) > API仕様 > ユーザー認証API > 全トークン失効（POST /api/auth/tokens/revokeAll）

# 全トークン失効（POST /api/auth/tokens/revokeAll）

本書は、全トークン失効 API（POST /api/auth/tokens/revokeAll）の正式な仕様を定義する。  
※ **現時点の実装（apps/web/src/app/api/auth/tokens/revokeAll/route.ts）を正とする。**

## 1. 概要

ログイン中ユーザーが保持する **すべての SyncToken を削除（全失効）**する API。

- 要ログイン
- 成功時は **204 No Content**
- **Content-Type: application/json を必須**とする（CSRF 簡易対策）
- 対象はログイン中ユーザー自身のトークンのみ

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_tokens_revoke_all_content_type | Content-Type 検証 | application/json 以外または未指定なら 400 |
| sec_auth_tokens_revoke_all_require_user | 認証要求 | requireUserId でログインユーザーを取得する |
| sec_auth_tokens_revoke_all_success | 全失効成功 | ログインユーザーの SyncToken を deleteMany し 204 を返す |
| sec_auth_tokens_revoke_all_security | 対象ユーザー制限 | where.userId をログインユーザーに限定する |
| sec_auth_tokens_revoke_all_internal_error | 内部エラー | Prisma 例外などを 500 相当にする |

---

## 3. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/tokens/revokeAll |

---

## 4. リクエスト

### 4.1 認可 {#sec_auth_tokens_revoke_all_require_user}

- 要ログイン
- 認証方法：`requireUserId` による Cookie 認証

### 4.2 ヘッダー {#sec_auth_tokens_revoke_all_content_type}

| 項目 | 必須 | 説明 |
|------|------|------|
| Content-Type | 必須 | application/json |

### 4.3 ボディ

- なし
- ただし、ボディが空であっても Content-Type は必須

---

## 5. レスポンス

### 5.1 成功（204 No Content） {#sec_auth_tokens_revoke_all_success}

- ボディなし

### 5.2 失敗

| sec_id | 状況 | ステータス | Body |
|---|---|---:|---|
| sec_auth_tokens_revoke_all_content_type | Content-Type が application/json でない | 400 | `{ "error": "bad_request" }` |
| sec_auth_tokens_revoke_all_require_user | 未ログイン | 401 | 認証処理に従う |
| sec_auth_tokens_revoke_all_internal_error | Prisma 例外など | 500 | ボディなし |

---

## 6. 挙動仕様

1. Cookie 認証によりユーザー ID を取得する
2. Content-Type を検証する
   - application/json 以外は 400
3. 指定ユーザーの SyncToken をすべて削除する
4. 204 No Content を返却する

---

## 7. DB アクセス

### 7.1 全失効 {#sec_auth_tokens_revoke_all_success}

```ts
prisma.syncToken.deleteMany({
  where: { userId: uid },
});
```

### 7.2 対象ユーザー制限 {#sec_auth_tokens_revoke_all_security}

- `where.userId` は必ず `requireUserId` で取得したログインユーザー ID にする
- 他ユーザーの SyncToken を削除してはならない

---

## 8. セキュリティ・設計上の注意 {#sec_auth_tokens_revoke_all_security}

- 対象は **ログイン中ユーザー自身のトークンのみ**
- 他ユーザーのトークンに影響を与えることはない
- トークン削除後は、既存セッション・クライアントはすべて無効化される
- UI 側では「全端末からログアウト」用途を想定

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > 全トークン失効（POST /api/auth/tokens/revokeAll）
