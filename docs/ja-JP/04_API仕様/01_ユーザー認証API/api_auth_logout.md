<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-105000Z-AULO
lang: ja-JP
canonical_title: ログアウト（POST /api/auth/logout）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログアウト（POST /api/auth/logout）

# ログアウト（POST /api/auth/logout）

本書は、ログアウト API（POST /api/auth/logout）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/logout/route.ts）および Vitest（apps/web/tests/api.auth.logout.spec.ts）を正とする。

---

## 1. 概要

ログイン中のユーザーのセッション Cookie（sid）を無効化する API。

- 認証不要
- 常に 200 + `{ ok:true }` を返す
- sid Cookie を `Max-Age=0` で破棄する
- 既にログアウト済みでも成功扱いにする
- アプリケーションレベルのエラー JSON は定義しない

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
|---|---|
| POST | /api/auth/logout |

---

## 4. 入力

なし。

- request body は使用しない
- 認証状態も問わない

---

## 5. レスポンス

### 5.1 成功 {#sec_auth_logout_success}

```json
{
  "ok": true
}
```

- HTTP 200

### 5.2 Cookie の無効化 {#sec_auth_logout_cookie_clear}

レスポンスには sid Cookie を無効化する `Set-Cookie` が含まれる。

```txt
Set-Cookie: sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0
```

- 現実装では `Secure` は付与しない
- 本番 HTTPS 運用で Secure を付与する場合は、実装・テスト・仕様を同時に更新する

---

## 6. ステータスコード

| sec_id | 状態 | ステータス | 説明 |
|---|---|---:|---|
| sec_auth_logout_success | 正常終了 | 200 | 常に 200 |
| sec_auth_logout_idempotent | セッションなし / 多重ログアウト | 200 | 既にログアウト済みでも成功扱い |

---

## 7. 挙動仕様

### 7.1 正常ケース {#sec_auth_logout_success}

- sid Cookie を `Max-Age=0` で破棄する
- セッションが存在しなくても成功扱い
- レスポンスは `{ ok:true }`

### 7.2 冪等性 {#sec_auth_logout_idempotent}

- 同一クライアントから複数回実行しても 200 + `{ ok:true }` を返す
- ログアウト済み状態でもエラーにしない

### 7.3 エラーケース {#sec_auth_logout_no_app_error}

- API は内部例外を JSON として返さない
- 仕様上、アプリケーションレベルのエラーレスポンスは定義しない

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログアウト（POST /api/auth/logout）
