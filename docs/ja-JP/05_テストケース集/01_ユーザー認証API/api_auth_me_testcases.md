[目次](../../目次.md) > テストケース集 > ユーザー認証API > ユーザー情報取得（GET /api/auth/me）

# テストケース：ユーザー情報取得（GET /api/auth/me）

## 1. Traceability

| テストケース | 対応 sec_id |
|---|---|
| AUTH_ME-TC-01 | sec_auth_me_session_read, sec_auth_me_logged_in, sec_auth_me_no_store |
| AUTH_ME-TC-02 | sec_auth_me_not_logged_in, sec_auth_me_no_store |
| AUTH_ME-TC-03 | sec_auth_me_read_error, sec_auth_me_no_store |
| AUTH_ME-TC-04 | sec_auth_me_not_logged_in |

---

## AUTH_ME-TC-01 正常（ログイン中）

### 対応 sec_id

- sec_auth_me_session_read
- sec_auth_me_logged_in
- sec_auth_me_no_store

### 条件

- 有効なセッション

### 期待

- 200
- ok:true
- user が返る
- Cache-Control:no-store

---

## AUTH_ME-TC-02 未ログイン

### 対応 sec_id

- sec_auth_me_not_logged_in
- sec_auth_me_no_store

### 条件

- Cookie なし
- または readSession が ok:false を返す

### 期待

- 200
- ok:false
- Cache-Control:no-store

---

## AUTH_ME-TC-03 readSession が例外

### 対応 sec_id

- sec_auth_me_read_error
- sec_auth_me_no_store

### 条件

- モックで例外を投げる

### 期待

- 200
- ok:false
- user:null
- Cache-Control:no-store

---

## AUTH_ME-TC-04 ok:true かつ user:null の挙動

### 対応 sec_id

- sec_auth_me_not_logged_in

### 条件

- readSession が { ok:true, user:null } を返す

### 期待

- ステータス: 200 または 401（実装依存）
- 200 の場合: ok:false

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > ユーザー情報取得（GET /api/auth/me）
