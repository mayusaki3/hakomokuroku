[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログアウト（POST /api/auth/logout）

# テストケース：ログアウト（POST /api/auth/logout）

本書は、ログアウト API（POST /api/auth/logout）のテストケース定義を示す。

## API_AUTH_LOGOUT-TC-01 正常（常に200）

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

### 概要
レスポンスに sid Cookie の削除が設定されていることを確認する。

### 期待される Set-Cookie（例）

```txt
sid=deleted; Path=/; HttpOnly; SameSite=Lax; Max-Age=0
```

### 期待結果

| 種別 | 値 |
|------|-----|
| Set-Cookie | sid が Max-Age=0 で無効化されている |

---

## API_AUTH_LOGOUT-TC-03 多重ログアウト（idempotent）

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
