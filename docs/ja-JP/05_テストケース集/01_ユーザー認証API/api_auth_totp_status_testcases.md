<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-093500Z-AUTSTT
lang: ja-JP
canonical_title: TOTP 状態取得テスト仕様（GET /api/auth/totp/status）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP 状態取得テスト仕様（GET /api/auth/totp/status）

# TOTP 状態取得テスト仕様（GET /api/auth/totp/status）

本書は、TOTP 状態取得 API（GET /api/auth/totp/status）のテスト仕様を定義する。  
apps/web/tests/api.auth.totp.status.spec.ts の 7 テストを正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_TOTP_STATUS-TC-01 | sec_auth_totp_status_success |
| AUTH_TOTP_STATUS-TC-02 | sec_auth_totp_status_bad_request |
| AUTH_TOTP_STATUS-TC-03 | sec_auth_totp_status_challenge |
| AUTH_TOTP_STATUS-TC-04 | sec_auth_totp_status_challenge |
| AUTH_TOTP_STATUS-TC-05 | sec_auth_totp_status_challenge |
| AUTH_TOTP_STATUS-TC-06 | sec_auth_totp_status_recovery_count |
| AUTH_TOTP_STATUS-TC-07 | sec_auth_totp_status_internal_error |

---

## 2. テストケース

### AUTH_TOTP_STATUS-TC-01 正常

- challenge 有効
- recoveryCodes 配列あり
- 期待:
  - 200
  - `ok=true`
  - `recoveryRemain` が配列長

### AUTH_TOTP_STATUS-TC-02 challengeId 無し

- query 未指定
- 期待:
  - 400
  - `bad_request`

### AUTH_TOTP_STATUS-TC-03 challenge 不存在

- `findUnique() => null`
- 期待:
  - 404
  - `not_found`

### AUTH_TOTP_STATUS-TC-04 challenge.used=true

- `used=true`
- 期待:
  - 404
  - `not_found`

### AUTH_TOTP_STATUS-TC-05 challenge 期限切れ

- `expiresAt < now`
- 期待:
  - 404
  - `not_found`

### AUTH_TOTP_STATUS-TC-06 recoveryCodes が null/非配列

- `recoveryCodes=null`
- 期待:
  - 200
  - `recoveryRemain=0`

### AUTH_TOTP_STATUS-TC-07 DB例外

- prisma 例外
- 期待:
  - 500

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

[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP 状態取得テスト仕様（GET /api/auth/totp/status）
