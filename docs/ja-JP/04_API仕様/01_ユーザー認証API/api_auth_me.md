[目次](../../目次.md) > API仕様 > ユーザー認証API > ユーザー情報取得（GET /api/auth/me）

# ユーザー情報取得（GET /api/auth/me）

現在のセッションに紐づくユーザー情報を返す。

---

## 1. 概要

- セッションが有効な場合 → ユーザー情報を返す
- セッションが無効 or readSession が例外の場合 → 200 + ok:false（実装・テスト準拠）
- 個人差分を含むため Cache-Control は no-store とする

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_me_session_read | セッション読取 | readSession を呼び出す |
| sec_auth_me_logged_in | ログイン中 | user がある場合 ok:true + user を返す |
| sec_auth_me_not_logged_in | 未ログイン | user がない場合 200 + ok:false を返す |
| sec_auth_me_read_error | readSession 例外 | 例外時も 200 + ok:false を返す |
| sec_auth_me_no_store | キャッシュ制御 | Cache-Control:no-store を返す |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| GET | /api/auth/me |

---

## 4. レスポンス

### 4.1 成功（ログイン中） {#sec_auth_me_logged_in}

```json
{
  "ok": true,
  "user": {
    "id": "string",
    "displayName": "string"
  }
}
```

- ステータスは 200
- user は readSession が返した値を返す

---

### 4.2 未ログイン {#sec_auth_me_not_logged_in}

```json
{
  "ok": false,
  "user": null
}
```

- ステータスは 200
- 未ログインはエラー扱いにしない

---

### 4.3 readSession 例外 {#sec_auth_me_read_error}

```json
{
  "ok": false,
  "user": null
}
```

- ステータスは 200
- 例外詳細はレスポンスに含めない
- 例外詳細はサーバーログへ出力する

---

## 5. ヘッダー {#sec_auth_me_no_store}

```txt
Cache-Control: no-store
```

---

## 6. 注意事項

- 認証状態チェックには `readSession` を使用する
- 例外を握りつぶす仕様はテストで固定化されており、変更不可
- 未ログイン時も 401 ではなく 200 を返す

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > ユーザー情報取得（GET /api/auth/me）
