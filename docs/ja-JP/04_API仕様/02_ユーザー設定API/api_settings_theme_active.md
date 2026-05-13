<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-100000Z-STA
lang: ja-JP
canonical_title: アクティブテーマ取得（GET /api/settings/theme/active）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー設定API > アクティブテーマ取得（GET /api/settings/theme/active）

# アクティブテーマ取得（GET /api/settings/theme/active）

本書は、アクティブテーマ取得 API（GET /api/settings/theme/active）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/settings/theme/active/route.ts）および Vitest（apps/web/tests/api.settings.theme.active.spec.ts）を正とする。

---

## 1. 概要

ログイン状態に応じて現在有効なテーマIDを返す API。

- 未ログインでも 200 を返す
- 未ログイン時は既定テーマ `default` を返す
- ログイン済みの場合は `themeActive` テーブルを参照する
- DBに設定がない場合は既定テーマ `default` を返す
- DB例外は 500 を返す

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_settings_theme_active_auth | 認証確認 | getUser でログイン状態を取得する |
| sec_settings_theme_active_default_guest | 未ログイン既定値 | 未ログインなら default を返す |
| sec_settings_theme_active_db_lookup | DB参照 | ログイン済みなら themeActive.findUnique を実行する |
| sec_settings_theme_active_success | 成功応答 | 200 + ok:true + active.themeId を返す |
| sec_settings_theme_active_default_missing | DB未設定既定値 | DBなしなら default を返す |
| sec_settings_theme_active_error | DB例外 | 500 + db error を返す |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| GET | /api/settings/theme/active |

---

## 4. 処理仕様

### 4.1 認証確認 {#sec_settings_theme_active_auth}

```ts
const { user } = await getUser();
```

- `user` が null の場合もエラーにしない
- 未ログイン時は DB を参照せず既定テーマを返す

### 4.2 既定テーマ {#sec_settings_theme_active_default_guest}

```ts
const DEFAULT_THEME_ID = 'default';
```

- 未ログイン時は `default`
- DB未設定時も `default`

### 4.3 DB参照 {#sec_settings_theme_active_db_lookup}

```ts
await prisma.themeActive.findUnique({
  where: { userId: user.id },
  select: { themeId: true },
});
```

### 4.4 成功応答 {#sec_settings_theme_active_success}

```json
{
  "ok": true,
  "active": {
    "themeId": "default"
  }
}
```

- HTTP 200
- `themeId` は DB値または `default`

### 4.5 DB例外 {#sec_settings_theme_active_error}

```json
{
  "ok": false,
  "error": "db error"
}
```

- HTTP 500

---

## 5. レスポンス一覧

| 条件 | HTTP | Body |
|---|---|---|
| 未ログイン | 200 | `{ "ok": true, "active": { "themeId": "default" } }` |
| ログイン済み + DBあり | 200 | `{ "ok": true, "active": { "themeId": "T1" } }` |
| ログイン済み + DBなし | 200 | `{ "ok": true, "active": { "themeId": "default" } }` |
| DB例外 | 500 | `{ "ok": false, "error": "db error" }` |

---

## 6. 設計上の注意

- 本 API は未ログイン状態でも UI 初期化に使用できる
- 未ログインをエラーにしないのは現実装仕様
- テーマ未設定時も UI 側で分岐不要にするため `default` を返す

---

[目次](../../目次.md) > API仕様 > ユーザー設定API > アクティブテーマ取得（GET /api/settings/theme/active）
