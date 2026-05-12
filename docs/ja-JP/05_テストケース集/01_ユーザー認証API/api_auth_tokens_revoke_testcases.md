[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）

# テストケース：トークン失効（POST /api/auth/tokens/revoke）

本書は、トークン失効 API（POST /api/auth/tokens/revoke）のテストケース定義を示す。  
※ 現時点の実装（apps/web/src/app/api/auth/tokens/revoke/route.ts）を正とする。

## 1. 前提

- Base URL: /api/auth/tokens/revoke
- requireUserId をモックして userId を固定できること
- prisma.syncToken.findUnique をモックできること
- prisma.syncToken.delete をモックできること

---

## 2. Traceability 対応表

| テストケースID | 対応 sec_id |
|---|---|
| AUTH_TOKENS_REVOKE-TC-01 | sec_auth_tokens_revoke_success |
| AUTH_TOKENS_REVOKE-TC-02 | sec_auth_tokens_revoke_require_user |
| AUTH_TOKENS_REVOKE-TC-03 | sec_auth_tokens_revoke_content_type |
| AUTH_TOKENS_REVOKE-TC-04 | sec_auth_tokens_revoke_invalid_request |
| AUTH_TOKENS_REVOKE-TC-05 | sec_auth_tokens_revoke_invalid_request |
| AUTH_TOKENS_REVOKE-TC-06 | sec_auth_tokens_revoke_not_found |
| AUTH_TOKENS_REVOKE-TC-07 | sec_auth_tokens_revoke_not_found / sec_auth_tokens_revoke_security |
| AUTH_TOKENS_REVOKE-TC-08 | sec_auth_tokens_revoke_internal_error |

---

## 3. テストケース一覧

- AUTH_TOKENS_REVOKE-TC-01 正常：token を失効（204）
- AUTH_TOKENS_REVOKE-TC-02 異常：未ログイン（401）
- AUTH_TOKENS_REVOKE-TC-03 異常：Content-Type 不正（400）
- AUTH_TOKENS_REVOKE-TC-04 異常：JSON パース不正（400）
- AUTH_TOKENS_REVOKE-TC-05 異常：id 未指定/非 string（400）
- AUTH_TOKENS_REVOKE-TC-06 異常：対象トークンなし（404）
- AUTH_TOKENS_REVOKE-TC-07 異常：他ユーザーの token（404）
- AUTH_TOKENS_REVOKE-TC-08 異常：DB 例外（500 相当）

---

## 4. テストケース詳細

### AUTH_TOKENS_REVOKE-TC-01 正常：token を失効（204）

- 対応 sec_id
  - sec_auth_tokens_revoke_success
- 前提
  - requireUserId -> "U1"
  - findUnique -> { id:"T1", userId:"U1" }
- 入力
  - Headers: Content-Type=application/json
  - Body: { id:"T1" }
- 期待結果
  - status=204
  - body なし（res.text() が空）
  - delete が where.id="T1" で呼ばれる

### AUTH_TOKENS_REVOKE-TC-02 異常：未ログイン（401）

- 対応 sec_id
  - sec_auth_tokens_revoke_require_user
- 前提
  - requireUserId が unauthorized を throw
- 期待結果
  - status=401

### AUTH_TOKENS_REVOKE-TC-03 異常：Content-Type 不正（400）

- 対応 sec_id
  - sec_auth_tokens_revoke_content_type
- 入力
  - Content-Type 未指定
- 期待結果
  - status=400
  - body={ error:"bad_request" }

### AUTH_TOKENS_REVOKE-TC-04 異常：JSON パース不正（400）

- 対応 sec_id
  - sec_auth_tokens_revoke_invalid_request
- 入力
  - JSON parse error
- 期待結果
  - status=400

### AUTH_TOKENS_REVOKE-TC-05 異常：id 未指定/非 string（400）

- 対応 sec_id
  - sec_auth_tokens_revoke_invalid_request
- 入力
  - {}
  - { id:123 }
- 期待結果
  - status=400

### AUTH_TOKENS_REVOKE-TC-06 異常：対象トークンなし（404）

- 対応 sec_id
  - sec_auth_tokens_revoke_not_found
- 前提
  - findUnique -> null
- 期待結果
  - status=404
  - body={ error:"not_found" }

### AUTH_TOKENS_REVOKE-TC-07 異常：他ユーザーの token（404）

- 対応 sec_id
  - sec_auth_tokens_revoke_not_found
  - sec_auth_tokens_revoke_security
- 前提
  - findUnique -> { id:"T1", userId:"OTHER" }
- 期待結果
  - status=404
  - body={ error:"not_found" }

### AUTH_TOKENS_REVOKE-TC-08 異常：DB 例外（500 相当）

- 対応 sec_id
  - sec_auth_tokens_revoke_internal_error
- 前提
  - findUnique または delete が例外を throw
- 期待結果
  - status=500 相当

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）
