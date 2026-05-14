<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-084500Z-AUMT
lang: ja-JP
canonical_title: ログイン状態確認テスト仕様（GET /api/auth/me）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン状態確認テスト仕様（GET /api/auth/me）

# ログイン状態確認テスト仕様（GET /api/auth/me）

本書は、ログイン状態確認 API（GET /api/auth/me）のテスト仕様を定義する。  
apps/web/tests/api.auth.me.spec.ts の 4 テストを正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| AUTH_ME-TC-01 | sec_auth_me_session_read / sec_auth_me_logged_in / sec_auth_me_no_store |
| AUTH_ME-TC-02 | sec_auth_me_not_logged_in / sec_auth_me_no_store |
| AUTH_ME-TC-03 | sec_auth_me_read_error / sec_auth_me_no_store |
| AUTH_ME-TC-04 | sec_auth_me_not_logged_in |

---

## 2. テストケース

### AUTH_ME-TC-01 正常：ログイン済み

#### 対応 sec_id

- sec_auth_me_session_read
- sec_auth_me_logged_in
- sec_auth_me_no_store

#### 条件

- `readSession()` がログイン済みユーザーを返す

#### 期待結果

- HTTP 200
- `ok:true`
- `user` が返る
- `Cache-Control:no-store`

---

### AUTH_ME-TC-02 正常：未ログイン

#### 対応 sec_id

- sec_auth_me_not_logged_in
- sec_auth_me_no_store

#### 条件

- `readSession()` が `{ ok:false, user:null }` を返す

#### 期待結果

- HTTP 200
- `ok:false`
- `user:null`
- `Cache-Control:no-store`

---

### AUTH_ME-TC-03 異常：readSession が例外

#### 対応 sec_id

- sec_auth_me_read_error
- sec_auth_me_no_store

#### 条件

- `readSession()` モックが例外を throw

#### 期待結果

- HTTP 200
- `ok:false`
- `user:null`
- `Cache-Control:no-store`
- サーバーログへ例外出力

---

### AUTH_ME-TC-04 境界：ok:true + user:null

#### 対応 sec_id

- sec_auth_me_not_logged_in

#### 条件

- `readSession()` が `{ ok:true, user:null }` を返す

#### 期待結果

- 現行テストは HTTP 200 または 401 を許容する
- 現 route 実装では HTTP 200
- HTTP 200 の場合、`ok:false`

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

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン状態確認テスト仕様（GET /api/auth/me）
