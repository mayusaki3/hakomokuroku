<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-084000Z-AUME
lang: ja-JP
canonical_title: ログイン状態確認（GET /api/auth/me）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン状態確認（GET /api/auth/me）

# ログイン状態確認（GET /api/auth/me）

本書は、ログイン状態確認 API（GET /api/auth/me）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/me/route.ts）および Vitest（apps/web/tests/api.auth.me.spec.ts）を正とする。

---

## 1. 概要

現在のセッション状態を返す API。

- ログイン済みなら `ok:true` と `user` を返す
- 未ログイン、セッション切れ、セッション読取例外でも HTTP 200 を返す
- 未ログイン状態は HTTP エラーではなく `ok:false` と `user:null` で表現する
- 個人差分のため `Cache-Control: no-store` を返す

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_me_no_store | キャッシュ制御 | Cache-Control:no-store を返す |
| sec_auth_me_session_read | セッション読取 | readSession を呼び出す |
| sec_auth_me_logged_in | ログイン済み | user が存在する場合、ok:true + user を返す |
| sec_auth_me_not_logged_in | 未ログイン | user が null の場合、200 + ok:false + user:null を返す |
| sec_auth_me_read_error | セッション読取例外 | readSession 例外時も 200 + ok:false + user:null を返す |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| GET | /api/auth/me |

---

## 4. リクエスト

### 4.1 認証 {#sec_auth_me_session_read}

- Cookie セッションを `readSession()` で読み取る
- この API 自体は未ログインでも 200 を返す

---

## 5. レスポンス

### 5.1 ログイン済み {#sec_auth_me_logged_in}

```json
{
  "ok": true,
  "user": {
    "id": "U1",
    "userName": "Alice",
    "iconDataUrl": null
  }
}
```

- status=200
- `user` は `readSession()` が返した値を返す

### 5.2 未ログイン {#sec_auth_me_not_logged_in}

```json
{
  "ok": false,
  "user": null
}
```

- status=200
- 未ログインは HTTP 401 ではなく状態応答として扱う

### 5.3 セッション読取例外 {#sec_auth_me_read_error}

```json
{
  "ok": false,
  "user": null
}
```

- status=200
- 詳細はサーバーログに記録する
- レスポンスには例外詳細を含めない

---

## 6. 共通ヘッダー {#sec_auth_me_no_store}

```txt
Cache-Control: no-store
```

---

## 7. 設計上の注意

- `/api/auth/me` はログイン状態確認用であり、未ログインを HTTP 401 で表現しない
- 認可が必要な API は別途 `requireUserId` などで 401/403 を返す
- UI は `ok` と `user` の組み合わせでログイン状態を判定する
- `readSession()` が `{ ok:true, user:null }` 相当を返しても、route 実装上は `ok:false` として扱う

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン状態確認（GET /api/auth/me）
