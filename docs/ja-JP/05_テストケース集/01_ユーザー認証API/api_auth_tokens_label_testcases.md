<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-104200Z-ATLT
lang: ja-JP
canonical_title: トークンラベル更新テスト仕様（POST /api/auth/tokens/label）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークンラベル更新テスト仕様（POST /api/auth/tokens/label）

# トークンラベル更新テスト仕様（POST /api/auth/tokens/label）

本書は、トークンラベル更新 API（POST /api/auth/tokens/label）のテスト仕様を定義する。  
apps/web/tests/api.auth.tokens.label.spec.ts を正とする。

---

## 1. 前提

- Base URL: `/api/auth/tokens/label`
- `@/lib/prisma` を mock 可能であること
- `@/lib/auth/requireUserId` を mock 可能であること
- `prisma.syncToken.updateMany` を mock 可能であること

---

## 2. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_TOKENS_LABEL-TC-01 | sec_auth_tokens_label_update |
| AUTH_TOKENS_LABEL-TC-02 | sec_auth_tokens_label_auth_error |
| AUTH_TOKENS_LABEL-TC-03 | sec_auth_tokens_label_content_type |
| AUTH_TOKENS_LABEL-TC-04 | sec_auth_tokens_label_json_parse |
| AUTH_TOKENS_LABEL-TC-05 | sec_auth_tokens_label_label_required |
| AUTH_TOKENS_LABEL-TC-06 | sec_auth_tokens_label_token_required |
| AUTH_TOKENS_LABEL-TC-06a | sec_auth_tokens_label_token_required |
| AUTH_TOKENS_LABEL-TC-07 | sec_auth_tokens_label_not_found |
| AUTH_TOKENS_LABEL-TC-08 | sec_auth_tokens_label_internal_error |
| AUTH_TOKENS_LABEL-TC-09 | sec_auth_tokens_label_content_type |
| AUTH_TOKENS_LABEL-TC-10 | sec_auth_tokens_label_auth_error |
| AUTH_TOKENS_LABEL-TC-11 | sec_auth_tokens_label_invalid_update_result |
| AUTH_TOKENS_LABEL-TC-12 | sec_auth_tokens_label_label_empty_allowed |
| AUTH_TOKENS_LABEL-TC-13 | sec_auth_tokens_label_label_empty_allowed |

---

## 3. テストケース

### AUTH_TOKENS_LABEL-TC-01 正常：body.token 指定でラベル更新（200）

- requireUserId -> `U1`
- updateMany -> `{ count: 1 }`
- 入力:

```json
{
  "token": "t1",
  "label": "L1"
}
```

- 期待:
  - 200

```json
{
  "ok": true
}
```

- updateMany:

```ts
{
  where: { userId: 'U1', tokenHash: 't1' },
  data: { deviceName: 'L1' },
}
```

### AUTH_TOKENS_LABEL-TC-02 異常：未ログイン（401）

- requireUserId -> reject `{ status: 401 }`
- 期待:

```json
{
  "error": "unauthorized"
}
```

### AUTH_TOKENS_LABEL-TC-03 異常：Content-Type 不正（400）

- `text/plain`
- 期待:

```json
{
  "error": "bad_request"
}
```

### AUTH_TOKENS_LABEL-TC-04 異常：JSON parse 不正（400）

- body=`"{"`
- 期待: 400

### AUTH_TOKENS_LABEL-TC-05 異常：label 未指定/非string（400）

パターン:

```json
{ "token": "t1" }
```

```json
{ "token": "t1", "label": 123 }
```

### AUTH_TOKENS_LABEL-TC-06 異常：token 未指定/非string（400）

パターン:

```json
{ "label": "L1" }
```

```json
{ "token": 123, "label": "L1" }
```

### AUTH_TOKENS_LABEL-TC-06a 異常：token が空白のみ（400）

```json
{
  "token": "   ",
  "label": "L1"
}
```

### AUTH_TOKENS_LABEL-TC-07 異常：対象トークンなし（404）

- updateMany -> `{ count: 0 }`
- 期待: 404

### AUTH_TOKENS_LABEL-TC-08 異常：DB例外（500相当）

- updateMany -> throw Error('DB error')
- 期待: 500以上

### AUTH_TOKENS_LABEL-TC-09 異常：Content-Type ヘッダ無し（400）

- Header 未指定
- 期待: 400

### AUTH_TOKENS_LABEL-TC-10 異常：requireUserId が status無し例外でも 401

- requireUserId -> throw Error('UNAUTHORIZED')
- 期待: 401

### AUTH_TOKENS_LABEL-TC-11 異常：updateMany が不正戻り値なら 500

- updateMany -> `{ count: '1' }`
- 期待: 500以上

### AUTH_TOKENS_LABEL-TC-12 正常：label が空文字でも許容（200）

```json
{
  "token": "t1",
  "label": ""
}
```

- 期待: 200

### AUTH_TOKENS_LABEL-TC-13 正常：label が空白のみでも許容（200）

```json
{
  "token": "t1",
  "label": "   "
}
```

- 期待: 200

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

[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークンラベル更新テスト仕様（POST /api/auth/tokens/label）
