<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-095500Z-SUT
lang: ja-JP
canonical_title: ユーザー設定取得・更新テスト仕様（GET/PUT /api/settings/user）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー設定API > ユーザー設定取得・更新テスト仕様（GET/PUT /api/settings/user）

# ユーザー設定取得・更新テスト仕様（GET/PUT /api/settings/user）

本書は、ユーザー設定取得・更新 API（GET/PUT /api/settings/user）のテスト仕様を定義する。  
apps/web/tests/api.settings.user.spec.ts の 13 テストを正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| API_SETTINGS_USER-TC-01 | sec_settings_user_get_success |
| API_SETTINGS_USER-TC-02 | sec_settings_user_get_unauthorized |
| API_SETTINGS_USER-TC-03 | sec_settings_user_get_db_error |
| API_SETTINGS_USER-TC-04 | sec_settings_user_get_not_found |
| API_SETTINGS_USER-TC-05 | sec_settings_user_get_null_fields |
| API_SETTINGS_USER-TC-10 | sec_settings_user_put_success |
| API_SETTINGS_USER-TC-11 | sec_settings_user_put_validate_display_name |
| API_SETTINGS_USER-TC-12 | sec_settings_user_put_unauthorized |
| API_SETTINGS_USER-TC-13 | sec_settings_user_put_db_error |
| API_SETTINGS_USER-TC-14 | sec_settings_user_put_validate_display_name |
| API_SETTINGS_USER-TC-15 | sec_settings_user_put_parse_body |
| API_SETTINGS_USER-TC-16 | sec_settings_user_put_validate_display_name |
| API_SETTINGS_USER-TC-17 | sec_settings_user_put_validate_display_name |

---

## 2. GET テストケース

### API_SETTINGS_USER-TC-01 ログイン中なら 200

- readSession.user あり
- DB ユーザーあり
- 期待:
  - 200
  - ok=true
  - user を返す

### API_SETTINGS_USER-TC-02 未ログイン

- readSession.user=null
- 期待:
  - 401

### API_SETTINGS_USER-TC-03 DB例外

- prisma.user.findFirst throw
- 期待:
  - 500

### API_SETTINGS_USER-TC-04 DBユーザーなし

- セッションあり
- findFirst=null
- 期待:
  - 404
  - user=null

### API_SETTINGS_USER-TC-05 nullable項目

- userName=null
- iconDataUrl=null
- 期待:
  - 200
  - null のまま返す

---

## 3. PUT テストケース

### API_SETTINGS_USER-TC-10 displayName 正常更新

- displayName='Alice'
- 期待:
  - 200
  - prisma.user.update 呼び出し

### API_SETTINGS_USER-TC-11 displayName 空文字

- displayName=''
- 期待:
  - 400

### API_SETTINGS_USER-TC-12 未ログイン

- readSession.user=null
- 期待:
  - 401

### API_SETTINGS_USER-TC-13 DB更新例外

- prisma.user.update throw
- 期待:
  - 500

### API_SETTINGS_USER-TC-14 displayName 未指定

- `{}`
- 期待:
  - 400

### API_SETTINGS_USER-TC-15 JSON parse 失敗

- body='{ invalid-json'
- 期待:
  - 400
  - `displayName is required`

### API_SETTINGS_USER-TC-16 displayName 空白のみ

- `'    '`
- 期待:
  - 400

### API_SETTINGS_USER-TC-17 displayName 非 string

- number
- 期待:
  - 400

---

## 4. ローカル検証手順

```powershell
pnpm -C apps/web exec vitest --run
```

期待結果:

```text
Test Files  22 passed
Tests       218 passed
```

---

[目次](../../目次.md) > テストケース集 > ユーザー設定API > ユーザー設定取得・更新テスト仕様（GET/PUT /api/settings/user）
