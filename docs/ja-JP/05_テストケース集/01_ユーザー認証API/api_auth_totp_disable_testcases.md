<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-094500Z-AUTDT
lang: ja-JP
canonical_title: TOTP 無効化テスト仕様（POST /api/auth/totp/disable）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP 無効化テスト仕様（POST /api/auth/totp/disable）

# TOTP 無効化テスト仕様（POST /api/auth/totp/disable）

本書は、TOTP 無効化 API（POST /api/auth/totp/disable）のテスト仕様を定義する。  
apps/web/tests/api.auth.totp.disable.spec.ts の 16 テストを正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_TOTP_DISABLE-TC-01 | sec_auth_totp_disable_success |
| AUTH_TOTP_DISABLE-TC-02 | sec_auth_totp_disable_success |
| AUTH_TOTP_DISABLE-TC-03 | sec_auth_totp_disable_auth |
| AUTH_TOTP_DISABLE-TC-04 | sec_auth_totp_disable_content_type |
| AUTH_TOTP_DISABLE-TC-05 | sec_auth_totp_disable_json_parse |
| AUTH_TOTP_DISABLE-TC-06 | sec_auth_totp_disable_input |
| AUTH_TOTP_DISABLE-TC-07 | sec_auth_totp_disable_input |
| AUTH_TOTP_DISABLE-TC-08 | sec_auth_totp_disable_input |
| AUTH_TOTP_DISABLE-TC-09 | sec_auth_totp_disable_enabled |
| AUTH_TOTP_DISABLE-TC-10 | sec_auth_totp_disable_verify |
| AUTH_TOTP_DISABLE-TC-11 | sec_auth_totp_disable_locked |
| AUTH_TOTP_DISABLE-TC-12 | sec_auth_totp_disable_internal_error |
| AUTH_TOTP_DISABLE-TC-13 | sec_auth_totp_disable_content_type |
| AUTH_TOTP_DISABLE-TC-14 | sec_auth_totp_disable_auth |
| AUTH_TOTP_DISABLE-TC-15 | sec_auth_totp_disable_json_parse |
| AUTH_TOTP_DISABLE-TC-16 | sec_auth_totp_disable_content_type |

---

## 2. テストケース

### AUTH_TOTP_DISABLE-TC-01 code 指定で無効化

- verifyTotpCode=true
- 期待:
  - 204
  - prisma.user.update 呼び出し

### AUTH_TOTP_DISABLE-TC-02 recoveryCode 指定で無効化

- verifyRecoveryCode=true
- 期待:
  - 204

### AUTH_TOTP_DISABLE-TC-03 未ログイン

- requireUserId が 401 相当を throw
- 期待:
  - 401

### AUTH_TOTP_DISABLE-TC-04 Content-Type 不正

- text/plain
- 期待:
  - 400
  - bad_request

### AUTH_TOTP_DISABLE-TC-05 JSON parse 不正

- body='{'
- 期待:
  - 400

### AUTH_TOTP_DISABLE-TC-06 code/recoveryCode 両方未指定

- `{}`
- `{ code:null }`
- `{ recoveryCode:null }`
- 期待:
  - 400

### AUTH_TOTP_DISABLE-TC-07 code 形式不正

- abc123
- 12345
- 期待:
  - 400

### AUTH_TOTP_DISABLE-TC-08 recoveryCode 形式不正

- 空文字
- number
- 期待:
  - 400

### AUTH_TOTP_DISABLE-TC-09 TOTP 未有効

- `totpEnabled=false`
- 期待:
  - 409
  - conflict

### AUTH_TOTP_DISABLE-TC-10 検証失敗

- verify=false
- 期待:
  - 401
  - unauthorized

### AUTH_TOTP_DISABLE-TC-11 ロック中

- lockUntil が未来
- 期待:
  - 429
  - too_many_requests

### AUTH_TOTP_DISABLE-TC-12 DB例外

- prisma.user.update throw
- 期待:
  - 500

### AUTH_TOTP_DISABLE-TC-13 Content-Type ヘッダ無し

- headers 未指定
- 期待:
  - 400

### AUTH_TOTP_DISABLE-TC-14 requireUserId 想定外例外

- 403 throw
- 期待:
  - route が throw

### AUTH_TOTP_DISABLE-TC-15 JSON が null

- body='null'
- 期待:
  - 400
  - bad_request

### AUTH_TOTP_DISABLE-TC-16 Content-Type ヘッダ無し + body無し

- body 無し
- 期待:
  - 400

---

## 3. ローカル検証手順

```powershell
pnpm -C apps/web exec vitest --run
```

期待結果:

```text
Test Files  22 passed
Tests       218 passed
```

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP 無効化テスト仕様（POST /api/auth/totp/disable）
