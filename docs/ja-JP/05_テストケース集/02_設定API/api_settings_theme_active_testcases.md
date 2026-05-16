<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260516-181000Z-STAT
lang: ja-JP
canonical_title: アクティブテーマ取得（GET /api/settings/theme/active）テストケース
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > 設定API > アクティブテーマ取得（GET /api/settings/theme/active）テストケース

# アクティブテーマ取得（GET /api/settings/theme/active）テストケース

本書は、アクティブテーマ取得 API（GET /api/settings/theme/active）のテストケースを定義する。  
対応仕様: `docs/ja-JP/04_API仕様/02_設定API/api_settings_theme_active.md`

---

## 1. 対象

| 項目 | 内容 |
|---|---|
| 対象API | GET /api/settings/theme/active |
| 対象実装 | apps/web/src/app/api/settings/theme/active/route.ts |
| 対象テスト | apps/web/tests/api.settings.theme.active.spec.ts |
| テスト方式 | Vitest route handler 直接呼び出し |

---

## 2. テストケース一覧

| test_id | 対応 sec_id | 観点 | 期待結果 |
|---|---|---|---|
| API_SETTINGS_THEME_ACTIVE-TC-01 | sec_settings_theme_active_get_user, sec_settings_theme_active_guest_default, sec_settings_theme_active_success | 未ログイン | 200 + default |
| API_SETTINGS_THEME_ACTIVE-TC-02 | sec_settings_theme_active_get_user, sec_settings_theme_active_find_active, sec_settings_theme_active_success | ログイン済み + DB登録済み | 200 + DB themeId |
| API_SETTINGS_THEME_ACTIVE-TC-03 | sec_settings_theme_active_find_active, sec_settings_theme_active_db_default, sec_settings_theme_active_success | ログイン済み + DB未登録 | 200 + default |
| API_SETTINGS_THEME_ACTIVE-TC-04 | sec_settings_theme_active_db_error | DB例外 | 500系 |

---

## 3. テストケース詳細

### 3.1 API_SETTINGS_THEME_ACTIVE-TC-01: 未ログインは既定テーマを返す

対応 sec_id:

- sec_settings_theme_active_get_user
- sec_settings_theme_active_guest_default
- sec_settings_theme_active_success

条件:

- `getUser()` が `{ user: null }` を返す

期待結果:

- status=200
- body.ok=true
- body.active.themeId="default"

### 3.2 API_SETTINGS_THEME_ACTIVE-TC-02: ログイン済みは DB のテーマを返す

対応 sec_id:

- sec_settings_theme_active_get_user
- sec_settings_theme_active_find_active
- sec_settings_theme_active_success

条件:

- `getUser()` が `{ user: { id: "U1" } }` を返す
- `findUnique()` が `{ themeId: "T1" }` を返す

期待結果:

- status=200
- body.ok=true
- body.active.themeId="T1"

### 3.3 API_SETTINGS_THEME_ACTIVE-TC-03: DB未登録は既定テーマ

対応 sec_id:

- sec_settings_theme_active_find_active
- sec_settings_theme_active_db_default
- sec_settings_theme_active_success

条件:

- `getUser()` がログイン済みを返す
- `findUnique()` が null を返す

期待結果:

- status=200
- body.active.themeId="default"

### 3.4 API_SETTINGS_THEME_ACTIVE-TC-04: DB例外は 500系

対応 sec_id:

- sec_settings_theme_active_db_error

条件:

- `findUnique()` が例外を投げる

期待結果:

- status が `[500,503]` のいずれか

---

## 4. ローカル確認コマンド

```bash
pnpm -C apps/web exec vitest --run tests/api.settings.theme.active.spec.ts
pnpm -C apps/web exec vitest --run
```

---

[目次](../../目次.md) > テストケース集 > 設定API > アクティブテーマ取得（GET /api/settings/theme/active）テストケース
