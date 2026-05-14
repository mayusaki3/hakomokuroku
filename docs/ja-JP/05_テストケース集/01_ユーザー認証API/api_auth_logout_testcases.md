<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-105500Z-AULT
lang: ja-JP
canonical_title: ログアウトテスト仕様（POST /api/auth/logout）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログアウトテスト仕様（POST /api/auth/logout）

# ログアウトテスト仕様（POST /api/auth/logout）

本書は、ログアウト API（POST /api/auth/logout）のテスト仕様を定義する。  
apps/web/tests/api.auth.logout.spec.ts の 3 テストを正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| API_AUTH_LOGOUT-TC-01 | sec_auth_logout_success |
| API_AUTH_LOGOUT-TC-02 | sec_auth_logout_cookie_clear |
| API_AUTH_LOGOUT-TC-03 | sec_auth_logout_idempotent / sec_auth_logout_success |

---

## 2. テストケース

### API_AUTH_LOGOUT-TC-01 正常：200 + ok:true

#### 対応 sec_id

- sec_auth_logout_success

#### 条件

- POST `/api/auth/logout`

#### 期待結果

- HTTP 200
- `{ ok:true }`

---

### API_AUTH_LOGOUT-TC-02 Cookie 破棄

#### 対応 sec_id

- sec_auth_logout_cookie_clear

#### 条件

- POST `/api/auth/logout`

#### 期待結果

- `Set-Cookie` に `sid=` を含む
- `Max-Age=0` を含む

例：

```txt
sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0
```

---

### API_AUTH_LOGOUT-TC-03 多重ログアウト（idempotent）

#### 対応 sec_id

- sec_auth_logout_idempotent
- sec_auth_logout_success

#### 条件

- POST → POST を連続実行

#### 期待結果

- 両方とも HTTP 200
- 両方とも `{ ok:true }`

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

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログアウトテスト仕様（POST /api/auth/logout）
