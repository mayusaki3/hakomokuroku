[目次](../../目次.md) > API仕様 > ユーザー認証API > ログアウト（POST /api/auth/logout）

# ログアウト（POST /api/auth/logout）

本書は、ログアウト API（POST /api/auth/logout）の正式な仕様を定義する。

## 1. 概要

ログイン中のユーザーのセッション cookie（sid）を無効化する。
本 API は idempotent（何度実行しても結果が変わらない）である。

- 認証不要（既にセッションが無い可能性があるため）
- 常に `{ ok: true }` を返す
- 内部例外を返却しない（Next.js の仕様上 throw が起きた場合はフレームワーク内部処理に委ねる）

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_logout_success | 正常終了 | 常に 200 + ok:true を返す |
| sec_auth_logout_cookie_clear | Cookie 破棄 | sid Cookie を Max-Age=0 で無効化する |
| sec_auth_logout_idempotent | 冪等性 | セッション有無や多重実行に関係なく成功扱いにする |
| sec_auth_logout_no_app_error | エラー方針 | アプリケーションレベルのエラー JSON を定義しない |

---

## 3. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/logout |

## 4. 入力

なし。

## 5. 出力（レスポンス）

### 5.1 成功（常に 200） {#sec_auth_logout_success}

```json
{ "ok": true }
```

### 5.2 Cookie の無効化 {#sec_auth_logout_cookie_clear}

レスポンスには sid Cookie を無効化する `Set-Cookie` が含まれる。

例：

```txt
Set-Cookie: sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0
```

## 6. ステータスコード

| sec_id | 状態 | ステータス | 説明 |
|---|---|---:|---|
| sec_auth_logout_success | 正常終了 | 200 | 常に 200 |
| sec_auth_logout_idempotent | セッションなし / 多重ログアウト | 200 | 既にログアウト済みでも成功扱い |

## 7. 挙動仕様

### 7.1 正常ケース {#sec_auth_logout_success}

- sid Cookie を Max-Age=0 で破棄する
- セッションが存在しなくても成功扱い
- レスポンスは `{ ok: true }`

### 7.2 冪等性 {#sec_auth_logout_idempotent}

- 同一クライアントから複数回実行しても 200 + ok:true を返す
- ログアウト済み状態でもエラーにしない

### 7.3 エラーケース {#sec_auth_logout_no_app_error}

- API は内部例外を JSON として返さない
- 仕様上、アプリケーションレベルのエラーレスポンスは定義しない

## 8. 例外ケース一覧

本 API はアプリケーションレベルのエラー JSON を返さないため、例外ケース定義は削除。

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > ログアウト（POST /api/auth/logout）
