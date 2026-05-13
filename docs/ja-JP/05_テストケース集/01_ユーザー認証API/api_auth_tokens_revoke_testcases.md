<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-102300Z-ATRT
lang: ja-JP
canonical_title: トークン失効テスト仕様（POST /api/auth/tokens/revoke）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン失効テスト仕様（POST /api/auth/tokens/revoke）

# トークン失効テスト仕様（POST /api/auth/tokens/revoke）

本書は、トークン失効 API（POST /api/auth/tokens/revoke）のテスト仕様を定義する。  
apps/web/tests/api.auth.tokens.revoke.spec.ts を正とする。

---

## 1. 前提

- Base URL: `/api/auth/tokens/revoke`
- `requireUserId` をモック可能であること
- `prisma.syncToken.findUnique` をモック可能であること
- `prisma.syncToken.delete` をモック可能であること
- JSON Content-Type 必須

---

## 2. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_TOKENS_REVOKE-TC-01 | sec_auth_tokens_revoke_success |
| AUTH_TOKENS_REVOKE-TC-03 | sec_auth_tokens_revoke_content_type |
| AUTH_TOKENS_REVOKE-TC-04 | sec_auth_tokens_revoke_invalid_request |
| AUTH_TOKENS_REVOKE-TC-05 | sec_auth_tokens_revoke_invalid_request |
| AUTH_TOKENS_REVOKE-TC-06 | sec_auth_tokens_revoke_not_found |
| AUTH_TOKENS_REVOKE-TC-07 | sec_auth_tokens_revoke_not_found / sec_auth_tokens_revoke_security |
| AUTH_TOKENS_REVOKE-TC-08 | sec_auth_tokens_revoke_internal_error |

---

## 3. テストケース

### AUTH_TOKENS_REVOKE-TC-01 正常：token を失効（204）

- findUnique -> `{ id:'T1', userId:'U1' }`
- 入力:

```json
{
  "id": "T1"
}
```

- 期待:
  - 204
  - body なし
  - delete が呼ばれる

### AUTH_TOKENS_REVOKE-TC-03 異常：Content-Type 不正（400）

- Content-Type 未指定
- 期待:

```json
{
  "error": "bad_request"
}
```

### AUTH_TOKENS_REVOKE-TC-04 異常：JSON パース不正（400）

- `req.json()` が throw
- 期待:
  - 400

### AUTH_TOKENS_REVOKE-TC-05 異常：id 未指定/非 string（400）

入力例:

```json
{}
```

```json
{
  "id": 123
}
```

- 期待:
  - 400

### AUTH_TOKENS_REVOKE-TC-06 異常：対象トークンなし（404）

- findUnique -> null
- 期待:

```json
{
  "error": "not_found"
}
```

### AUTH_TOKENS_REVOKE-TC-07 異常：他ユーザー token（404）

- findUnique -> `{ id:'T1', userId:'OTHER' }`
- 期待:

```json
{
  "error": "not_found"
}
```

### AUTH_TOKENS_REVOKE-TC-08 異常：DB例外（500）

- findUnique または delete が throw
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

[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン失効テスト仕様（POST /api/auth/tokens/revoke）
