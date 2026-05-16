<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260516-180500Z-STA
lang: ja-JP
canonical_title: アクティブテーマ取得（GET /api/settings/theme/active）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > 設定API > アクティブテーマ取得（GET /api/settings/theme/active）

# アクティブテーマ取得（GET /api/settings/theme/active）

本書は、アクティブテーマ取得 API（GET /api/settings/theme/active）の仕様を定義する。  
現時点の実装（apps/web/src/app/api/settings/theme/active/route.ts）および Vitest（apps/web/tests/api.settings.theme.active.spec.ts）を正とする。

---

## 1. 概要

ログイン中ユーザーのアクティブテーマを取得する API。

- 未ログイン時は既定テーマを返す
- DB に設定が存在しない場合も既定テーマを返す
- 現在の既定テーマ ID は `default`
- DB 例外時は 500 を返す

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_settings_theme_active_get_user | ユーザー取得 | getUser() でログイン状態を確認する |
| sec_settings_theme_active_guest_default | 未ログイン既定テーマ | 未ログイン時は default を返す |
| sec_settings_theme_active_find_active | DB取得 | themeActive.findUnique で取得する |
| sec_settings_theme_active_db_default | DB未登録既定テーマ | DB未登録時は default を返す |
| sec_settings_theme_active_success | 正常応答 | 200 + ok:true + active.themeId を返す |
| sec_settings_theme_active_db_error | DB例外 | DB例外時は 500 を返す |

---

## 3. エンドポイント

| メソッド | パス | 用途 |
|---|---|---|
| GET | /api/settings/theme/active | 現在のアクティブテーマ取得 |

---

## 4. GET 仕様

### 4.1 認証確認 {#sec_settings_theme_active_get_user}

```ts
const { user } = await getUser();
```

- `user` が null の場合は未ログイン扱い
- 未ログインでも 401 ではなく既定テーマを返す

### 4.2 未ログイン時既定テーマ {#sec_settings_theme_active_guest_default}

```json
{
  "ok": true,
  "active": {
    "themeId": "default"
  }
}
```

- HTTP 200

### 4.3 DB取得 {#sec_settings_theme_active_find_active}

```ts
await prisma.themeActive.findUnique({
  where: { userId: user.id },
  select: { themeId: true },
});
```

### 4.4 DB未登録既定テーマ {#sec_settings_theme_active_db_default}

- `findUnique()` が null の場合は `default` を返す

### 4.5 正常応答 {#sec_settings_theme_active_success}

```json
{
  "ok": true,
  "active": {
    "themeId": "T1"
  }
}
```

- HTTP 200

### 4.6 DB例外 {#sec_settings_theme_active_db_error}

```json
{
  "ok": false,
  "error": "db error"
}
```

- HTTP 500
- テスト側は `[500,503]` を許容している

---

## 5. 設計上の注意

- 未ログインをエラー扱いしない
- DB 未登録でも既定テーマへフォールバックする
- 現在の実装では `Cache-Control` は付与していない
- `themeId` は string として返却する

---

[目次](../../目次.md) > API仕様 > 設定API > アクティブテーマ取得（GET /api/settings/theme/active）
