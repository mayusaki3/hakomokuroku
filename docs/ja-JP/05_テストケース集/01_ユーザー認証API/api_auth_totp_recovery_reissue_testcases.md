<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-111500Z-AUTRRT
lang: ja-JP
canonical_title: リカバリコード再発行テスト仕様（POST /api/auth/totp/recovery/reissue）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > リカバリコード再発行テスト仕様（POST /api/auth/totp/recovery/reissue）

# リカバリコード再発行テスト仕様（POST /api/auth/totp/recovery/reissue）

本書は、リカバリコード再発行 API（POST /api/auth/totp/recovery/reissue）のテスト仕様を定義する。  
apps/web/tests/api.auth.totp.recovery.reissue.spec.ts の 12 テストを正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_TOTP_RECOVERY_REISSUE-TC-01 | sec_auth_totp_recovery_reissue_success |
| AUTH_TOTP_RECOVERY_REISSUE-TC-02 | sec_auth_totp_recovery_reissue_auth |
| AUTH_TOTP_RECOVERY_REISSUE-TC-03 | sec_auth_totp_recovery_reissue_content_type |
| AUTH_TOTP_RECOVERY_REISSUE-TC-04 | sec_auth_totp_recovery_reissue_json_parse |
| AUTH_TOTP_RECOVERY_REISSUE-TC-05 | sec_auth_totp_recovery_reissue_code_validation |
| AUTH_TOTP_RECOVERY_REISSUE-TC-06 | sec_auth_totp_recovery_reissue_code_validation |
| AUTH_TOTP_RECOVERY_REISSUE-TC-07 | sec_auth_totp_recovery_reissue_user_lookup |
| AUTH_TOTP_RECOVERY_REISSUE-TC-08 | sec_auth_totp_recovery_reissue_enabled |
| AUTH_TOTP_RECOVERY_REISSUE-TC-09 | sec_auth_totp_recovery_reissue_verify |
| AUTH_TOTP_RECOVERY_REISSUE-TC-10 | sec_auth_totp_recovery_reissue_internal_error |
| AUTH_TOTP_RECOVERY_REISSUE-TC-11 | sec_auth_totp_recovery_reissue_replace |
| AUTH_TOTP_RECOVERY_REISSUE-TC-12 | sec_auth_totp_recovery_reissue_content_type |

---

## 2. テストケース

### AUTH_TOTP_RECOVERY_REISSUE-TC-01 正常：正しい code で再発行

- TOTP 有効ユーザー
- verifyTotpCode=true
- 期待:
  - 200
  - recoveryCodes 10件
  - `XXXX-XXXX` 形式
  - DB 保存値は 64桁 SHA-256 hex

### AUTH_TOTP_RECOVERY_REISSUE-TC-02 未ログイン

- requireUserId throw
- 期待:
  - 401 unauthorized

### AUTH_TOTP_RECOVERY_REISSUE-TC-03 Content-Type 不正

- text/plain
- 期待:
  - 400 invalid_request

### AUTH_TOTP_RECOVERY_REISSUE-TC-04 JSON parse 不正

- body='{'
- 期待:
  - 400 invalid_request

### AUTH_TOTP_RECOVERY_REISSUE-TC-05 code 未指定/空

- {}
- { code:'' }
- { code:'   ' }
- 期待:
  - 400 invalid_request

### AUTH_TOTP_RECOVERY_REISSUE-TC-06 code 形式不正

- abc123
- 12345
- 1234567
- 12 3456
- 期待:
  - 400 invalid_request

### AUTH_TOTP_RECOVERY_REISSUE-TC-07 ユーザー不明

- prisma.user.findUnique=null
- 期待:
  - 404 not_found

### AUTH_TOTP_RECOVERY_REISSUE-TC-08 TOTP 未有効

- totpEnabled=false
- secret 無し
- 期待:
  - 409 conflict

### AUTH_TOTP_RECOVERY_REISSUE-TC-09 TOTP 検証失敗

- verifyTotpCode=false
- 期待:
  - 400 auth_failed
  - prisma.user.update 未実行

### AUTH_TOTP_RECOVERY_REISSUE-TC-10 DB 例外

- prisma.user.update throw
- 期待:
  - 500 internal_error

### AUTH_TOTP_RECOVERY_REISSUE-TC-11 旧リカバリコード失効

- 再発行実施
- 期待:
  - recoveryCodes が旧セットと異なる
  - DB の recoveryCodes が置換される

### AUTH_TOTP_RECOVERY_REISSUE-TC-12 Content-Type ヘッダ無し

- headers.get() = null
- 期待:
  - 400 invalid_request

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

[目次](../../目次.md) > テストケース集 > ユーザー認証API > リカバリコード再発行テスト仕様（POST /api/auth/totp/recovery/reissue）
