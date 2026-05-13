<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-100300Z-STAT
lang: ja-JP
canonical_title: アクティブテーマ取得テスト仕様（GET /api/settings/theme/active）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー設定API > アクティブテーマ取得テスト仕様（GET /api/settings/theme/active）

# アクティブテーマ取得テスト仕様（GET /api/settings/theme/active）

本書は、アクティブテーマ取得 API（GET /api/settings/theme/active）のテスト仕様を定義する。  
apps/web/tests/api.settings.theme.active.spec.ts の 5 テストを正とする。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| API_SETTINGS_THEME_ACTIVE-TC-01 | sec_settings_theme_active_default_guest |
| API_SETTINGS_THEME_ACTIVE-TC-02 | sec_settings_theme_active_success |
| API_SETTINGS_THEME_ACTIVE-TC-03 | sec_settings_theme_active_default_missing |
| API_SETTINGS_THEME_ACTIVE-TC-04 | sec_settings_theme_active_error |

---

## 2. テストケース

### API_SETTINGS_THEME_ACTIVE-TC-01 未ログイン既定テーマ

- getUser.user=null
- 期待:
  - 200
  - ok=true
  - active.themeId='default'

### API_SETTINGS_THEME_ACTIVE-TC-02 ログイン済みテーマ取得

- getUser.user.id='U1'
- DB: themeId='T1'
- 期待:
  - 200
  - active.themeId='T1'

### API_SETTINGS_THEME_ACTIVE-TC-03 DB未設定

- ログイン済み
- findUnique=null
- 期待:
  - 200
  - active.themeId='default'

### API_SETTINGS_THEME_ACTIVE-TC-04 DB例外

- findUnique throw
- 期待:
  - 500 系

---

## 3. ローカル検証手順

```powershell
pnpm -C apps/web exec vitest --run
```

期待結果:

```text
Test Files  22 passed
Tests       218 passed
```

---

[目次](../../目次.md) > テストケース集 > ユーザー設定API > アクティブテーマ取得テスト仕様（GET /api/settings/theme/active）
