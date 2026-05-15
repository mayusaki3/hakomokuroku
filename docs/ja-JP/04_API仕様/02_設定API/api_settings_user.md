<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-095000Z-SU
lang: ja-JP
canonical_title: ユーザー設定取得・更新（GET/PUT /api/settings/user）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > 設定API > ユーザー設定取得・更新（GET/PUT /api/settings/user）

# ユーザー設定取得・更新（GET/PUT /api/settings/user）

本書は、ユーザー設定取得・更新 API（GET/PUT /api/settings/user）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/settings/user/route.ts）および Vitest（apps/web/tests/api.settings.user.spec.ts）を正とする。

---

## 1. 概要

ログイン中ユーザーの表示名、アイコン、TOTP 有効状態を取得し、表示名を更新する API。

- GET はログイン中ユーザー情報を返す
- PUT は `displayName` を `userName` として保存する
- 認証判定は `readSession()` を使用する
- GET/PUT とも `Cache-Control: no-store` を返す
- 未ログインは 401
- DB ユーザー不在は GET で 404
- DB 例外は 500

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_settings_user_no_store | キャッシュ抑止 | Cache-Control:no-store を返す |
| sec_settings_user_get_session | GET 認証確認 | readSession でログイン状態を確認する |
| sec_settings_user_get_unauthorized | GET 未ログイン | 未ログインなら 401 を返す |
| sec_settings_user_get_find_user | GET ユーザー取得 | id + isActive=true で findFirst する |
| sec_settings_user_get_success | GET 成功 | 200 + ok:true + user を返す |
| sec_settings_user_get_not_found | GET DBユーザーなし | セッションあり + DBユーザーなしは 404 を返す |
| sec_settings_user_get_null_fields | GET nullable | userName/iconDataUrl null を null のまま返す |
| sec_settings_user_get_db_error | GET DB例外 | 500 を返す |
| sec_settings_user_put_session | PUT 認証確認 | readSession でログイン状態を確認する |
| sec_settings_user_put_unauthorized | PUT 未ログイン | 未ログインなら 401 を返す |
| sec_settings_user_put_parse_body | PUT JSON parse | JSON不正時は validation failure として 400 を返す |
| sec_settings_user_put_validate_display_name | PUT 入力検証 | displayName 未指定/空/空白のみ/非string は 400 を返す |
| sec_settings_user_put_success | PUT 成功 | userName を trim 後 displayName で更新し 200 + ok:true を返す |
| sec_settings_user_put_db_error | PUT DB例外 | 500 を返す |

---

## 3. エンドポイント

| メソッド | パス | 用途 |
|---|---|---|
| GET | /api/settings/user | ユーザー設定取得 |
| PUT | /api/settings/user | 表示名更新 |

---

## 4. GET 仕様

### 4.1 認証 {#sec_settings_user_get_session}

- `readSession()` によりセッションを確認する
- `user` が存在しない場合は 401

### 4.2 DB取得 {#sec_settings_user_get_find_user}

```ts
await prisma.user.findFirst({
  where: { id: user.id, isActive: true },
  select: {
    id: true,
    userId: true,
    userName: true,
    iconDataUrl: true,
    totpEnabled: true,
  },
});
```

### 4.3 GET 正常応答 {#sec_settings_user_get_success}

```json
{
  "ok": true,
  "user": {
    "id": "U1",
    "userId": "alice",
    "userName": "Alice",
    "iconDataUrl": "data:image/png;base64,...",
    "totpEnabled": true
  }
}
```

- HTTP 200
- `userName` / `iconDataUrl` は null を許容する
- `totpEnabled` は boolean に正規化する

### 4.4 GET 異常応答

| 条件 | HTTP | Body |
|---|---:|---|
| 未ログイン | 401 | `{ "ok": false, "user": null }` |
| DBユーザーなし | 404 | `{ "ok": false, "user": null }` |
| DB例外 | 500 | `{ "ok": false, "user": null }` |

---

## 5. PUT 仕様

### 5.1 認証 {#sec_settings_user_put_session}

- `readSession()` によりセッションを確認する
- `user` が存在しない場合は 401

### 5.2 Body(JSON) {#sec_settings_user_put_validate_display_name}

```json
{
  "displayName": "Alice"
}
```

| 項目 | 必須 | 条件 |
|---|---:|---|
| displayName | 必須 | string かつ trim 後 1 文字以上 |

- 未指定、空文字、空白のみ、非 string は 400
- JSON parse 失敗時は body=null として扱い、displayName 未指定と同じ 400 を返す

### 5.3 PUT 成功応答 {#sec_settings_user_put_success}

```json
{
  "ok": true
}
```

- HTTP 200
- `prisma.user.update({ where: { id }, data: { userName: displayName.trim() } })` を実行する

### 5.4 PUT 異常応答

| 条件 | HTTP | Body |
|---|---:|---|
| 未ログイン | 401 | `{ "ok": false, "user": null }` |
| displayName 不正 | 400 | `{ "ok": false, "message": "displayName is required" }` |
| DB例外 | 500 | `{ "ok": false }` |

---

## 6. 共通ヘッダー {#sec_settings_user_no_store}

全応答で以下を返す。

```txt
Cache-Control: no-store
```

---

## 7. セキュリティ・設計上の注意

- GET は `isActive=true` のユーザーのみ返す
- PUT は現在ログイン中のユーザーIDのみ更新対象にする
- `displayName` は trim 後の値を保存する
- キャッシュ抑止により、ユーザー設定の古い表示を避ける

---

[目次](../../目次.md) > API仕様 > 設定API > ユーザー設定取得・更新（GET/PUT /api/settings/user）
