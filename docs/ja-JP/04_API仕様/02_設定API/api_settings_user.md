[目次](../../目次.md) > API仕様 > 設定API > ユーザー設定取得・更新（/api/settings/user）

# ユーザー設定取得・更新（/api/settings/user）

本書は、ユーザー設定取得・更新 API（GET/PUT /api/settings/user）の正式な仕様を定義する。  
※ 現時点の実装（apps/web/src/app/api/settings/user/route.ts）および Vitest（apps/web/tests/api.settings.user.spec.ts）を正とする。

---

## 1. 概要

ログイン中ユーザーの表示名・アイコン・TOTP有効状態などを取得し、表示名を更新する。

- GET はログイン中ユーザー情報を返す
- PUT は `displayName` を `userName` として更新する
- 個人差分のため `Cache-Control: no-store` を返す
- 認証判定は `readSession` を使用する

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_settings_user_no_store | キャッシュ制御 | GET/PUT とも Cache-Control:no-store を返す |
| sec_settings_user_get_session | GET セッション確認 | readSession でログイン状態を確認する |
| sec_settings_user_get_unauthorized | GET 未ログイン | user:null の場合 401 を返す |
| sec_settings_user_get_find_user | GET DB取得 | isActive=true のユーザーを findFirst で取得する |
| sec_settings_user_get_success | GET 成功 | 200 + ok:true + user を返す |
| sec_settings_user_get_not_found | GET DBユーザーなし | セッションあり + DBユーザーなしは 404 を返す |
| sec_settings_user_get_null_fields | GET null項目 | userName/iconDataUrl null を null のまま返す |
| sec_settings_user_get_db_error | GET DB例外 | findFirst 例外時は 500 を返す |
| sec_settings_user_put_session | PUT セッション確認 | readSession でログイン状態を確認する |
| sec_settings_user_put_unauthorized | PUT 未ログイン | user:null の場合 401 を返す |
| sec_settings_user_put_parse_body | PUT JSON解析 | JSON不正時は validation failure として 400 を返す |
| sec_settings_user_put_validate_display_name | PUT displayName検証 | displayName 未指定/空/非string は 400 を返す |
| sec_settings_user_put_success | PUT 成功 | userName を更新し 200 + ok:true を返す |
| sec_settings_user_put_db_error | PUT DB例外 | update 例外時は 500 を返す |

---

## 3. エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | /api/settings/user | ログイン中ユーザー設定を取得する |
| PUT | /api/settings/user | ログイン中ユーザーの displayName を更新する |

---

## 4. GET /api/settings/user

### 4.1 認証 {#sec_settings_user_get_session}

- `readSession()` を呼び出す
- `user` が存在しない場合は未ログイン扱い

### 4.2 未ログイン {#sec_settings_user_get_unauthorized}

```json
{
  "ok": false,
  "user": null
}
```

- status=401

### 4.3 DB取得 {#sec_settings_user_get_find_user}

```ts
prisma.user.findFirst({
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

### 4.4 成功 {#sec_settings_user_get_success}

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

- status=200

### 4.5 DBユーザーなし {#sec_settings_user_get_not_found}

```json
{
  "ok": false,
  "user": null
}
```

- status=404

### 4.6 null項目 {#sec_settings_user_get_null_fields}

- `userName` が null の場合は null を返す
- `iconDataUrl` が null の場合は null を返す
- `totpEnabled` は truthy/falsy を boolean 化する

### 4.7 DB例外 {#sec_settings_user_get_db_error}

```json
{
  "ok": false,
  "user": null
}
```

- status=500

---

## 5. PUT /api/settings/user

### 5.1 認証 {#sec_settings_user_put_session}

- `readSession()` を呼び出す
- `user` が存在しない場合は未ログイン扱い

### 5.2 未ログイン {#sec_settings_user_put_unauthorized}

```json
{
  "ok": false,
  "user": null
}
```

- status=401

### 5.3 リクエストボディ {#sec_settings_user_put_parse_body}

```json
{
  "displayName": "Alice"
}
```

### 5.4 displayName検証 {#sec_settings_user_put_validate_display_name}

- `displayName` が string であること
- trim 後に空でないこと
- 未指定、空文字、非string、JSON不正はいずれも 400

400応答:

```json
{
  "ok": false,
  "message": "displayName is required"
}
```

### 5.5 成功 {#sec_settings_user_put_success}

```ts
prisma.user.update({
  where: { id: user.id },
  data: { userName: displayName },
});
```

応答:

```json
{
  "ok": true
}
```

- status=200

### 5.6 DB例外 {#sec_settings_user_put_db_error}

```json
{
  "ok": false
}
```

- status=500

---

## 6. 共通ヘッダー {#sec_settings_user_no_store}

```txt
Cache-Control: no-store
```

---
[目次](../../目次.md) > API仕様 > 設定API > ユーザー設定取得・更新（/api/settings/user）
