[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログアウト（POST /api/auth/logout）

# テストケース：ログアウト（POST /api/auth/logout）

本書は、ログアウト API（POST /api/auth/logout）のテストケース定義を示す。

## 1. 対応仕様

| テストケースID | 対応 sec_id | 検証責務 |
|---|---|---|
| API_AUTH_LOGOUT-TC-01 | sec_auth_logout_success | 常時 200 + ok:true |
| API_AUTH_LOGOUT-TC-02 | sec_auth_logout_cookie_clear | sid Cookie を無効化 |
| API_AUTH_LOGOUT-TC-03 | sec_auth_logout_idempotent | 多重ログアウト時も成功 |

---

## API_AUTH_LOGOUT-TC-01 正常（常に200）

### 対応 sec_id

- sec_auth_logout_success

### 概要

ログアウト要求は常に成功し、`{ ok:true }` が返る。

### 入力

POST /api/auth/logout

### 期待結果

| 種別 | 値 |
|------|-----|
| ステータス | 200 |
| ボディ | { ok:true } |

---

## API_AUTH_LOGOUT-TC-02 Cookie が正しく破棄されること

### 対応 sec_id

- sec_auth_logout_cookie_clear

### 概要

レスポンスに sid Cookie の削除が設定されていることを確認する。

### 期待される Set-Cookie（例）

```txt
sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0
```

### 期待結果

| 種別 | 値 |
|------|-----|
| Set-Cookie | sid が Max-Age=0 で無効化されている |

---

## API_AUTH_LOGOUT-TC-03 多重ログアウト（idempotent）

### 対応 sec_id

- sec_auth_logout_idempotent
- sec_auth_logout_success

### 概要

複数回ログアウトしても同じ結果になる。

### 手順

POST → POST

### 期待結果（両方のレスポンス）

| ステータス | ボディ |
|------------|--------|
| 200 | { ok:true } |

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログアウト（POST /api/auth/logout）
