<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-085500Z-AULT
lang: ja-JP
canonical_title: ログインテスト仕様（POST /api/auth/login）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログインテスト仕様（POST /api/auth/login）

# ログインテスト仕様（POST /api/auth/login）

本書は、ログイン API（POST /api/auth/login）のテスト仕様を定義する。  
apps/web/tests/api.auth.login.spec.ts の Vitest を正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| API_AUTH_LOGIN-TC-01 | sec_auth_login_success_basic |
| API_AUTH_LOGIN-TC-02 | sec_auth_login_invalid_request, sec_auth_login_request_body |
| API_AUTH_LOGIN-TC-03 | sec_auth_login_invalid_request |
| API_AUTH_LOGIN-TC-04 | sec_auth_login_user_lookup, sec_auth_login_auth_failed, sec_auth_login_security |
| API_AUTH_LOGIN-TC-05 | sec_auth_login_auth_failed, sec_auth_login_security |
| API_AUTH_LOGIN-TC-07 | sec_auth_login_locked |

---

## 2. テストケース

### API_AUTH_LOGIN-TC-01 正常：ログイン成功

#### 対応 sec_id

- sec_auth_login_success_basic

#### 条件

- 正しい `userId`
- 正しい `password`

#### 期待結果

- HTTP 200
- `ok:true`
- `Set-Cookie` に `sid=` を含む

---

### API_AUTH_LOGIN-TC-02 異常：必須項目不足

#### 対応 sec_id

- sec_auth_login_invalid_request
- sec_auth_login_request_body

#### 条件

- `userId` 未指定
- `password` 未指定
- 空文字
- `null`

#### 期待結果

- HTTP 400
- `ok:false`

---

### API_AUTH_LOGIN-TC-03 異常：body 不正

#### 対応 sec_id

- sec_auth_login_invalid_request

#### 条件

- JSON body が `null`
- object 以外
- JSON parse 失敗

#### 期待結果

- HTTP 400
- `error=invalid_request`

---

### API_AUTH_LOGIN-TC-04 異常：ユーザー不明

#### 対応 sec_id

- sec_auth_login_user_lookup
- sec_auth_login_auth_failed
- sec_auth_login_security

#### 条件

- 存在しない `userId`

#### 期待結果

- HTTP 401
- `error=unauthorized`
- 未登録ユーザーであることを特定できる情報を返さない

---

### API_AUTH_LOGIN-TC-05 異常：パスワード不一致

#### 対応 sec_id

- sec_auth_login_auth_failed
- sec_auth_login_security

#### 条件

- 存在する `userId`
- 誤った `password`

#### 期待結果

- HTTP 401
- `error=unauthorized`
- パスワード不一致であることを特定できる情報を返さない

---

### API_AUTH_LOGIN-TC-07 異常：lockUntil が未来

#### 対応 sec_id

- sec_auth_login_locked

#### 条件

- `lockUntil > now()`

#### 期待結果

- HTTP 401
- `error=unauthorized`

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

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログインテスト仕様（POST /api/auth/login）
