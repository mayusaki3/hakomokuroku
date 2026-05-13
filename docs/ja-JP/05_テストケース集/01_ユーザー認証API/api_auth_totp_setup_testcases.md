<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-091500Z-AUTST
lang: ja-JP
canonical_title: TOTP 設定開始テスト仕様（POST /api/auth/totp/setup）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP 設定開始テスト仕様（POST /api/auth/totp/setup）

# TOTP 設定開始テスト仕様（POST /api/auth/totp/setup）

本書は、TOTP 設定開始 API（POST /api/auth/totp/setup）のテスト仕様を定義する。  
apps/web/tests/api.auth.totp.setup.spec.ts の Vitest を正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| T01 | sec_auth_totp_setup_auth |
| T02 | sec_auth_totp_setup_user_lookup |
| T03 | sec_auth_totp_setup_conflict |
| T04 | sec_auth_totp_setup_success, sec_auth_totp_setup_persist |
| T05 | sec_auth_totp_setup_internal_error |
| T06 | sec_auth_totp_setup_encrypt, sec_auth_totp_setup_internal_error |
| T07 | sec_auth_totp_setup_encrypt, sec_auth_totp_setup_internal_error |

---

## 2. テストケース

### T01 未ログイン

#### 対応 sec_id

- sec_auth_totp_setup_auth

#### 条件

- `getCurrentUser()` が null

#### 期待結果

- HTTP 401
- `error=unauthorized`

---

### T02 ユーザー不明

#### 対応 sec_id

- sec_auth_totp_setup_user_lookup

#### 条件

- `prisma.user.findUnique()` が null

#### 期待結果

- HTTP 404
- `error=not_found`

---

### T03 既に TOTP 有効

#### 対応 sec_id

- sec_auth_totp_setup_conflict

#### 条件

- `user.totpEnabled=true`

#### 期待結果

- HTTP 409
- `error=conflict`

---

### T04 正常

#### 対応 sec_id

- sec_auth_totp_setup_success
- sec_auth_totp_setup_persist

#### 条件

- 未有効ユーザー
- 正常な `TOTP_SECRET_KEY`

#### 期待結果

- HTTP 200
- `ok=true`
- `otpauthUrl` が `otpauth://` を含む
- `prisma.user.update()` が呼ばれる

---

### T05 DB 例外

#### 対応 sec_id

- sec_auth_totp_setup_internal_error

#### 条件

- `prisma.user.update()` が例外を throw

#### 期待結果

- HTTP 500
- `error=internal_error`

---

### T06 鍵未設定

#### 対応 sec_id

- sec_auth_totp_setup_encrypt
- sec_auth_totp_setup_internal_error

#### 条件

- `TOTP_SECRET_KEY` 未設定

#### 期待結果

- HTTP 500
- `error=internal_error`

---

### T07 鍵長不正

#### 対応 sec_id

- sec_auth_totp_setup_encrypt
- sec_auth_totp_setup_internal_error

#### 条件

- `TOTP_SECRET_KEY` が 32 bytes ではない

#### 期待結果

- HTTP 500
- `error=internal_error`

---

## 3. ローカル検証手順

```powershell
pnpm -C apps/web exec vitest --run
```

期待結果：

```text
Test Files  22 passed
Tests       218 passed
```

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP 設定開始テスト仕様（POST /api/auth/totp/setup）
