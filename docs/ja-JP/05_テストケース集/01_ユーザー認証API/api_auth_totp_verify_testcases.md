<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-092500Z-AUTVT
lang: ja-JP
canonical_title: TOTP 有効化確認テスト仕様（POST /api/auth/totp/verify）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP 有効化確認テスト仕様（POST /api/auth/totp/verify）

# TOTP 有効化確認テスト仕様（POST /api/auth/totp/verify）

本書は、TOTP 有効化確認 API（POST /api/auth/totp/verify）のテスト仕様を定義する。  
apps/web/tests/api.auth.totp.verify.spec.ts の 23 テストを正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_TOTP_VERIFY-TC-01 | sec_auth_totp_verify_success |
| AUTH_TOTP_VERIFY-TC-02 | sec_auth_totp_verify_code_validation |
| AUTH_TOTP_VERIFY-TC-03 | sec_auth_totp_verify_code_validation |
| AUTH_TOTP_VERIFY-TC-04 | sec_auth_totp_verify_code_mismatch |
| AUTH_TOTP_VERIFY-TC-05 | sec_auth_totp_verify_auth |
| AUTH_TOTP_VERIFY-TC-06 | sec_auth_totp_verify_conflict |
| AUTH_TOTP_VERIFY-TC-07 | sec_auth_totp_verify_conflict |
| AUTH_TOTP_VERIFY-IMPL-01 | sec_auth_totp_verify_content_type |
| AUTH_TOTP_VERIFY-IMPL-02 | sec_auth_totp_verify_json_parse |
| AUTH_TOTP_VERIFY-IMPL-03 | sec_auth_totp_verify_user_lookup |
| AUTH_TOTP_VERIFY-IMPL-04 | sec_auth_totp_verify_code_mismatch |
| AUTH_TOTP_VERIFY-IMPL-05 | sec_auth_totp_verify_internal_error |
| AUTH_TOTP_VERIFY-IMPL-06 | sec_auth_totp_verify_content_type |
| AUTH_TOTP_VERIFY-IMPL-07 | sec_auth_totp_verify_content_type |
| AUTH_TOTP_VERIFY-IMPL-08 | sec_auth_totp_verify_content_type |
| AUTH_TOTP_VERIFY-IMPL-09 | sec_auth_totp_verify_content_type |
| AUTH_TOTP_VERIFY-IMPL-10 | sec_auth_totp_verify_json_parse |
| AUTH_TOTP_VERIFY-IMPL-11 | sec_auth_totp_verify_error_mapping |
| AUTH_TOTP_VERIFY-IMPL-12 | sec_auth_totp_verify_error_mapping |
| AUTH_TOTP_VERIFY-IMPL-13 | sec_auth_totp_verify_error_mapping |
| AUTH_TOTP_VERIFY-IMPL-14 | sec_auth_totp_verify_error_mapping |
| AUTH_TOTP_VERIFY-IMPL-15 | sec_auth_totp_verify_auth |
| AUTH_TOTP_VERIFY-IMPL-16 | sec_auth_totp_verify_error_mapping |

---

## 2. TC 系テスト

### AUTH_TOTP_VERIFY-TC-01 正常

- setup 済み
- 正しい code
- 期待:
  - 200
  - `ok=true`
  - `recoveryCodes.length === 10`

### AUTH_TOTP_VERIFY-TC-02 code 未指定/空

- 期待:
  - 400
  - `invalid_request`

### AUTH_TOTP_VERIFY-TC-03 code 形式不正

- 入力例:
  - `abc123`
  - `12345`
- 期待:
  - 400
  - `invalid_request`

### AUTH_TOTP_VERIFY-TC-04 code 不一致

- 現実装:
  - 400
  - `auth_failed`

### AUTH_TOTP_VERIFY-TC-05 未ログイン

- 期待:
  - 401
  - `unauthorized`

### AUTH_TOTP_VERIFY-TC-06 setup 未実行

- `totpPendingSecretEnc=null`
- 期待:
  - 409
  - `conflict`

### AUTH_TOTP_VERIFY-TC-07 既に有効化済み

- `totpEnabled=true`
- 期待:
  - 409
  - `conflict`

---

## 3. IMPL 系テスト

### AUTH_TOTP_VERIFY-IMPL-01

- Content-Type 不正
- 400 invalid_request

### AUTH_TOTP_VERIFY-IMPL-02

- JSON parse 失敗
- 400 invalid_request

### AUTH_TOTP_VERIFY-IMPL-03

- DB ユーザー不明
- 404 not_found

### AUTH_TOTP_VERIFY-IMPL-04

- `totpFailCount=null`
- code 不一致時に +1 処理

### AUTH_TOTP_VERIFY-IMPL-05

- DB update 例外
- 500 internal_error

### AUTH_TOTP_VERIFY-IMPL-06

- Content-Type ヘッダ無し
- 400 invalid_request

### AUTH_TOTP_VERIFY-IMPL-07

- `headers.get('content-type') === null`
- 400 invalid_request

### AUTH_TOTP_VERIFY-IMPL-08

- `application/json; charset=utf-8`
- 許容される

### AUTH_TOTP_VERIFY-IMPL-09

- Content-Type 空文字
- 400 invalid_request

### AUTH_TOTP_VERIFY-IMPL-10

- `req.json()` が SyntaxError 以外を throw
- 400 invalid_request

### AUTH_TOTP_VERIFY-IMPL-11

- `UNAUTHORIZED` throw
- 401 unauthorized

### AUTH_TOTP_VERIFY-IMPL-12

- `NOT_FOUND` throw
- 404 not_found

### AUTH_TOTP_VERIFY-IMPL-13

- `CONFLICT` throw
- 409 conflict

### AUTH_TOTP_VERIFY-IMPL-14

- `AUTH_FAILED` throw
- 400 auth_failed

### AUTH_TOTP_VERIFY-IMPL-15

- `getCurrentUser()` が undefined
- 401 unauthorized

### AUTH_TOTP_VERIFY-IMPL-16

- `throw undefined`
- 500 internal_error

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

[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP 有効化確認テスト仕様（POST /api/auth/totp/verify）
