<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-101300Z-ATKT
lang: ja-JP
canonical_title: トークン一覧取得テスト仕様（GET /api/auth/tokens）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン一覧取得テスト仕様（GET /api/auth/tokens）

# トークン一覧取得テスト仕様（GET /api/auth/tokens）

本書は、トークン一覧取得 API（GET /api/auth/tokens）のテスト仕様を定義する。  
apps/web/tests/api.auth.tokens.spec.ts の 8 テストを正とする。

---

## 1. 前提

- Base URL: `/api/auth/tokens`
- `requireUserId` をモック可能であること
- `prisma.syncToken.findMany` をモック可能であること
- 現行実装では GET でも `Content-Type: application/json` を要求する

---

## 2. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_TOKENS-TC-01 | sec_auth_tokens_content_type / sec_auth_tokens_require_user / sec_auth_tokens_success |
| AUTH_TOKENS-TC-02 | sec_auth_tokens_content_type / sec_auth_tokens_require_user / sec_auth_tokens_empty |
| AUTH_TOKENS-TC-03 | sec_auth_tokens_unauthorized |
| AUTH_TOKENS-TC-04 | sec_auth_tokens_content_type |
| AUTH_TOKENS-TC-05 | sec_auth_tokens_db_error |
| AUTH_TOKENS-TC-06 | sec_auth_tokens_content_type |
| AUTH_TOKENS-TC-07 | sec_auth_tokens_forbidden |
| AUTH_TOKENS-TC-08 | sec_auth_tokens_unauthorized |

---

## 3. テストケース

### AUTH_TOKENS-TC-01 正常：トークン一覧を返す（200）

- requireUserId -> `U1`
- findMany -> 2件
- Content-Type: application/json
- 期待:
  - 200
  - body が配列
  - findMany の戻り値と一致

### AUTH_TOKENS-TC-02 正常：0件でも空配列（200）

- requireUserId -> `U1`
- findMany -> []
- 期待:
  - 200
  - body=[]

### AUTH_TOKENS-TC-03 異常：未ログイン（401）

- requireUserId が 401 を throw
- 期待:
  - 401

### AUTH_TOKENS-TC-04 異常：Content-Type 不正（400）

- Content-Type=text/plain
- 期待:
  - 400

### AUTH_TOKENS-TC-05 異常：DB 例外（500 相当）

- findMany throw
- 期待:
  - status >= 500

### AUTH_TOKENS-TC-06 異常：Content-Type ヘッダ無し（400）

- Content-Type 未指定
- 期待:
  - 400

### AUTH_TOKENS-TC-07 異常：認可エラー（403 など）をそのまま返す

- requireUserId が status=403 を throw
- 期待:
  - 403

### AUTH_TOKENS-TC-08 異常：status 無し例外でも 401

- requireUserId が status 無し Error を throw
- 期待:
  - 401

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

[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン一覧取得テスト仕様（GET /api/auth/tokens）
