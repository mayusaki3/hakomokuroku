<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-103200Z-ATRA
lang: ja-JP
canonical_title: 全トークン失効テスト仕様（POST /api/auth/tokens/revokeAll）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > 全トークン失効テスト仕様（POST /api/auth/tokens/revokeAll）

# 全トークン失効テスト仕様（POST /api/auth/tokens/revokeAll）

本書は、全トークン失効 API（POST /api/auth/tokens/revokeAll）のテスト仕様を定義する。  
apps/web/tests/api.auth.tokens.revokeAll.spec.ts を正とする。

---

## 1. 前提

- Base URL: `/api/auth/tokens/revokeAll`
- `requireUserId` をモック可能であること
- `prisma.syncToken.deleteMany` をモック可能であること
- JSON Content-Type 必須

---

## 2. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_TOKENS_REVOKEALL-TC-01 | sec_auth_tokens_revoke_all_success / sec_auth_tokens_revoke_all_security |
| AUTH_TOKENS_REVOKEALL-TC-02 | sec_auth_tokens_revoke_all_require_user / sec_auth_tokens_revoke_all_auth_error_passthrough |
| AUTH_TOKENS_REVOKEALL-TC-03 | sec_auth_tokens_revoke_all_content_type |
| AUTH_TOKENS_REVOKEALL-TC-04 | sec_auth_tokens_revoke_all_internal_error |

---

## 3. テストケース

### AUTH_TOKENS_REVOKEALL-TC-01 正常：全トークン削除（204）

- requireUserId -> `U1`
- 入力:

```json
{}
```

- 期待:
  - 204
  - deleteMany が以下で呼ばれる

```ts
{
  where: { userId: 'U1' }
}
```

### AUTH_TOKENS_REVOKEALL-TC-02 異常：未ログイン（例外 throw）

- requireUserId -> throw Error('unauthorized')
- 期待:
  - route 内でレスポンス変換せず throw

### AUTH_TOKENS_REVOKEALL-TC-03 異常：Content-Type 不正（400）

- Content-Type 未指定
- 期待:

```json
{
  "error": "bad_request"
}
```

### AUTH_TOKENS_REVOKEALL-TC-04 異常：DB例外（500）

- deleteMany が throw
- 期待:
  - 500

---

## 4. ローカル検証手順

```powershell
pnpm -C apps/web exec vitest --run
```

期待結果:

```text
Test Files  22 passed
Tests       218 passed
```

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > 全トークン失効テスト仕様（POST /api/auth/tokens/revokeAll）
