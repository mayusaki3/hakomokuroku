<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-110500Z-AURT
lang: ja-JP
canonical_title: ユーザー登録テスト仕様（POST /api/auth/register）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ユーザー登録テスト仕様（POST /api/auth/register）

# ユーザー登録テスト仕様（POST /api/auth/register）

本書は、ユーザー登録 API（POST /api/auth/register）のテスト仕様を定義する。  
apps/web/tests/api.auth.register.spec.ts の 11 テストを正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_REGISTER-TC-01 | sec_auth_register_success / sec_auth_register_security / sec_auth_register_trim_user_id |
| AUTH_REGISTER-TC-02 | sec_auth_register_content_type |
| AUTH_REGISTER-TC-03 | sec_auth_register_json_parse |
| AUTH_REGISTER-TC-04 | sec_auth_register_user_id_validation |
| AUTH_REGISTER-TC-05 | sec_auth_register_password_validation |
| AUTH_REGISTER-TC-06 | sec_auth_register_conflict |
| AUTH_REGISTER-TC-07 | sec_auth_register_internal_error |
| AUTH_REGISTER-TC-08 | sec_auth_register_content_type |
| AUTH_REGISTER-TC-09 | sec_auth_register_content_type |
| AUTH_REGISTER-TC-10 | sec_auth_register_json_parse |
| AUTH_REGISTER-TC-11 | sec_auth_register_conflict / sec_auth_register_trim_user_id |

---

## 2. テストケース

### AUTH_REGISTER-TC-01 正常：新規ユーザー登録（200）

#### 対応 sec_id

- sec_auth_register_success
- sec_auth_register_security
- sec_auth_register_trim_user_id

#### 条件

- prisma.user.findFirst -> null
- prisma.user.create -> success

#### 期待結果

- HTTP 200
- `{ ok:true }`
- passwordHash は平文 password と異なる
- userId は trim 後の値で create される

---

### AUTH_REGISTER-TC-02 異常：Content-Type 不正（400）

#### 対応 sec_id

- sec_auth_register_content_type

#### 条件

- `Content-Type: text/plain`

#### 期待結果

- HTTP 400
- `{ ok:false, error:"bad_request" }`

---

### AUTH_REGISTER-TC-03 異常：JSON パース不正（400）

#### 対応 sec_id

- sec_auth_register_json_parse

#### 条件

- 壊れた JSON

#### 期待結果

- HTTP 400

---

### AUTH_REGISTER-TC-04 異常：userId 未指定/空/非string（400）

#### 対応 sec_id

- sec_auth_register_user_id_validation

#### 条件

- userId 未指定
- userId 空文字
- userId 非 string

#### 期待結果

- HTTP 400

---

### AUTH_REGISTER-TC-05 異常：password 未指定/空/非string（400）

#### 対応 sec_id

- sec_auth_register_password_validation

#### 条件

- password 未指定
- password 空文字
- password 非 string

#### 期待結果

- HTTP 400

---

### AUTH_REGISTER-TC-06 異常：既に登録済み（409）

#### 対応 sec_id

- sec_auth_register_conflict

#### 条件

- prisma.user.findFirst -> existing user

#### 期待結果

- HTTP 409
- `{ ok:false, error:"already_exists" }`
- prisma.user.create は呼ばれない

---

### AUTH_REGISTER-TC-07 異常：DB 例外（500 相当）

#### 対応 sec_id

- sec_auth_register_internal_error

#### 条件

- prisma.user.findFirst または create が throw

#### 期待結果

- HTTP 500 相当

---

### AUTH_REGISTER-TC-08 異常：Content-Type ヘッダ無し（400）

#### 対応 sec_id

- sec_auth_register_content_type

#### 条件

- Content-Type ヘッダ無し

#### 期待結果

- HTTP 400

---

### AUTH_REGISTER-TC-09 異常：body なし（400）

#### 対応 sec_id

- sec_auth_register_content_type

#### 条件

- body 未指定

#### 期待結果

- HTTP 400

---

### AUTH_REGISTER-TC-10 異常：JSON が null（400）

#### 対応 sec_id

- sec_auth_register_json_parse

#### 条件

- JSON body が null

#### 期待結果

- HTTP 400

---

### AUTH_REGISTER-TC-11 userId は trim して既存判定する（409）

#### 対応 sec_id

- sec_auth_register_conflict
- sec_auth_register_trim_user_id

#### 条件

- userId に前後空白を含む
- trim 後 userId が既存ユーザーと一致

#### 期待結果

- HTTP 409
- prisma.user.findFirst は trim 後値で呼ばれる
- prisma.user.create は呼ばれない

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

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ユーザー登録テスト仕様（POST /api/auth/register）
