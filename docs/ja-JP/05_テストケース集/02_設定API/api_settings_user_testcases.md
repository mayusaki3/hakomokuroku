<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260521-api-settings-user-testcases
lang: ja-JP
canonical_title: ユーザー設定取得・更新（/api/settings/user）テストケース
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > 設定API > ユーザー設定取得・更新（/api/settings/user）

# ユーザー設定取得・更新（/api/settings/user）テストケース

本書は、ユーザー設定取得・更新 API（GET/PUT /api/settings/user）のテストケースを定義する。  
対応仕様: `docs/ja-JP/04_API仕様/02_設定API/api_settings_user.md`

---

## 1. 対象

| 項目 | 内容 |
|---|---|
| 対象API | GET /api/settings/user, PUT /api/settings/user |
| 対象実装 | apps/web/src/app/api/settings/user/route.ts |
| 対象テスト | apps/web/tests/api.settings.user.spec.ts |
| テスト方式 | Vitest による route handler 直接呼び出し |

---

## 2. テストケース一覧

| test_id | 対象 | 対応 sec_id | 観点 | 期待結果 |
|---|---|---|---|---|
| API_SETTINGS_USER-TC-01 | GET | sec_settings_user_get_session, sec_settings_user_get_find_user, sec_settings_user_get_success, sec_settings_user_no_store | ログイン中ユーザー取得 | 200 + ok:true + user |
| API_SETTINGS_USER-TC-02 | GET | sec_settings_user_get_session, sec_settings_user_get_unauthorized, sec_settings_user_no_store | 未ログイン | 401 + ok:false |
| API_SETTINGS_USER-TC-03 | GET | sec_settings_user_get_db_error, sec_settings_user_no_store | DB例外 | 500 + ok:false |
| API_SETTINGS_USER-TC-04 | GET | sec_settings_user_get_find_user, sec_settings_user_get_not_found, sec_settings_user_no_store | セッションあり + DBユーザーなし | 404 + ok:false + user:null |
| API_SETTINGS_USER-TC-05 | GET | sec_settings_user_get_success, sec_settings_user_get_null_fields, sec_settings_user_no_store | null項目返却 | 200 + userName:null + iconDataUrl:null |
| API_SETTINGS_USER-TC-10 | PUT | sec_settings_user_put_session, sec_settings_user_put_validate_display_name, sec_settings_user_put_success, sec_settings_user_no_store | displayName 正常更新 | 200 + ok:true |
| API_SETTINGS_USER-TC-11 | PUT | sec_settings_user_put_validate_display_name, sec_settings_user_no_store | displayName 空文字 | 400 |
| API_SETTINGS_USER-TC-12 | PUT | sec_settings_user_put_session, sec_settings_user_put_unauthorized, sec_settings_user_no_store | 未ログイン | 401 |
| API_SETTINGS_USER-TC-13 | PUT | sec_settings_user_put_db_error, sec_settings_user_no_store | DB更新例外 | 500 |
| API_SETTINGS_USER-TC-14 | PUT | sec_settings_user_put_validate_display_name, sec_settings_user_no_store | displayName 未指定 | 400 |
| API_SETTINGS_USER-TC-15 | PUT | sec_settings_user_put_parse_body, sec_settings_user_put_validate_display_name, sec_settings_user_no_store | JSONパースエラー | 400 + message |
| API_SETTINGS_USER-TC-16 | PUT | sec_settings_user_put_validate_display_name, sec_settings_user_no_store | displayName 非string | 400 |
| API_SETTINGS_USER-TC-17 | PUT | sec_settings_user_put_validate_display_name, sec_settings_user_put_success, sec_settings_user_no_store | displayName trim | 200 + trim済み userName |

---

## 3. GET テストケース詳細

### 3.1 API_SETTINGS_USER-TC-01: ログイン中なら 200 + ok:true + user

対応 sec_id:

- sec_settings_user_get_session
- sec_settings_user_get_find_user
- sec_settings_user_get_success
- sec_settings_user_no_store

条件:

- `readSession()` が `{ user: { id: "U1" } }` を返す
- `prisma.user.findFirst()` が有効ユーザーを返す

期待結果:

- status=200
- body.ok=true
- body.user に `id`, `userId`, `userName`, `iconDataUrl`, `totpEnabled` が含まれる
- `Cache-Control: no-store`

### 3.2 API_SETTINGS_USER-TC-02: 未ログインなら 401

対応 sec_id:

- sec_settings_user_get_session
- sec_settings_user_get_unauthorized
- sec_settings_user_no_store

条件:

- `readSession()` が `{ user: null }` を返す

期待結果:

- status=401
- body.ok=false
- body.user=null
- `Cache-Control: no-store`

### 3.3 API_SETTINGS_USER-TC-03: DB例外なら 500

対応 sec_id:

- sec_settings_user_get_db_error
- sec_settings_user_no_store

条件:

- `readSession()` はログイン中を返す
- `prisma.user.findFirst()` が例外を投げる

期待結果:

- status=500
- body.ok=false
- body.user=null
- `Cache-Control: no-store`

### 3.4 API_SETTINGS_USER-TC-04: セッションあり + DBユーザーなしは 404

対応 sec_id:

- sec_settings_user_get_find_user
- sec_settings_user_get_not_found
- sec_settings_user_no_store

条件:

- `readSession()` はログイン中を返す
- `prisma.user.findFirst()` が null を返す

期待結果:

- status=404
- body.ok=false
- body.user=null
- `Cache-Control: no-store`

### 3.5 API_SETTINGS_USER-TC-05: userName / iconDataUrl が null でも 200

対応 sec_id:

- sec_settings_user_get_success
- sec_settings_user_get_null_fields
- sec_settings_user_no_store

条件:

- `readSession()` はログイン中を返す
- `userName=null`, `iconDataUrl=null`, `totpEnabled=false` の有効ユーザーを返す

期待結果:

- status=200
- body.user.userName=null
- body.user.iconDataUrl=null
- body.user.totpEnabled=false
- `Cache-Control: no-store`

---

## 4. PUT テストケース詳細

### 4.1 API_SETTINGS_USER-TC-10: displayName を正常更新できる

対応 sec_id:

- sec_settings_user_put_session
- sec_settings_user_put_validate_display_name
- sec_settings_user_put_success
- sec_settings_user_no_store

条件:

- `readSession()` はログイン中を返す
- body.displayName="Alice"
- `prisma.user.update()` が成功する

期待結果:

- status=200
- body.ok=true
- `prisma.user.update({ where: { id: "U1" }, data: { userName: "Alice" } })` が呼ばれる
- `Cache-Control: no-store`

### 4.2 API_SETTINGS_USER-TC-11: displayName 空文字は 400

対応 sec_id:

- sec_settings_user_put_validate_display_name
- sec_settings_user_no_store

条件:

- body.displayName=""

期待結果:

- status=400
- body.ok=false
- `prisma.user.update()` は呼ばれない
- `Cache-Control: no-store`

### 4.3 API_SETTINGS_USER-TC-12: 未ログインは 401

対応 sec_id:

- sec_settings_user_put_session
- sec_settings_user_put_unauthorized
- sec_settings_user_no_store

条件:

- `readSession()` が `{ user: null }` を返す

期待結果:

- status=401
- body.ok=false
- user=null
- `prisma.user.update()` は呼ばれない
- `Cache-Control: no-store`

### 4.4 API_SETTINGS_USER-TC-13: DB更新例外は 500

対応 sec_id:

- sec_settings_user_put_db_error
- sec_settings_user_no_store

条件:

- `readSession()` はログイン中を返す
- `prisma.user.update()` が例外を投げる

期待結果:

- status=500
- body.ok=false
- `Cache-Control: no-store`

### 4.5 API_SETTINGS_USER-TC-14: displayName 未指定は 400

対応 sec_id:

- sec_settings_user_put_validate_display_name
- sec_settings_user_no_store

条件:

- body に displayName が存在しない

期待結果:

- status=400
- `prisma.user.update()` は呼ばれない
- `Cache-Control: no-store`

### 4.6 API_SETTINGS_USER-TC-15: JSONパースエラーなら 400

対応 sec_id:

- sec_settings_user_put_parse_body
- sec_settings_user_put_validate_display_name
- sec_settings_user_no_store

条件:

- body が壊れた JSON

期待結果:

- status=400
- body.ok=false
- body.message="displayName is required"
- `Cache-Control: no-store`

### 4.7 API_SETTINGS_USER-TC-16: displayName 非stringは 400

対応 sec_id:

- sec_settings_user_put_validate_display_name
- sec_settings_user_no_store

条件:

- body.displayName が string 以外

期待結果:

- status=400
- `prisma.user.update()` は呼ばれない
- `Cache-Control: no-store`

### 4.8 API_SETTINGS_USER-TC-17: displayName は trim して保存する

対応 sec_id:

- sec_settings_user_put_validate_display_name
- sec_settings_user_put_success
- sec_settings_user_no_store

条件:

- body.displayName="  Alice  "

期待結果:

- status=200
- `data.userName` は "Alice"
- `Cache-Control: no-store`

---

## 5. ローカル確認コマンド

```bash
pnpm -C apps/web exec vitest --run tests/api.settings.user.spec.ts
pnpm -C apps/web exec vitest --run
```

---
[目次](../../目次.md) > テストケース集 > 設定API > ユーザー設定取得・更新（/api/settings/user）
