[目次](../../目次.md) > テストケース集 > テーマ設定API > テーマ有効化状況取得（GET /api/settings/theme/active）

# テストケース：テーマ有効化状況取得（GET /api/settings/theme/active）

## API_SETTINGS_THEME_ACTIVE-TC-01 未ログインは既定テーマを返す
### 前提
- 未ログイン状態（セッションなし）

### 手順
1. GET /api/settings/theme/active を呼び出す

### 期待
- ステータスコード: 200
- レスポンスボディ:
```json
{
  "ok": true,
  "active": {
    "themeId": "default",
    ...
  }
}
```

---

## API_SETTINGS_THEME_ACTIVE-TC-02 ログイン済みは UserSetting のアクティブテーマを返す
### 前提
- ログイン済み（有効なセッションあり）
- ユーザーの UserSetting.themeId = "default-dark"
- Theme テーブルに id="default-dark" のテーマが存在する

### 手順
1. GET /api/settings/theme/active を呼び出す

### 期待
- ステータスコード: 200
- レスポンスボディ:
```json
{
  "ok": true,
  "active": {
    "themeId": "default-dark",
    ...
  }
}
```

---

## API_SETTINGS_THEME_ACTIVE-TC-03 ログイン済みだがアクティブテーマ無し/レコード無し → 既定テーマ
### 前提
- ログイン済み
- パターンA: UserSetting.themeId が null
- パターンB: UserSetting.themeId は存在するが、Theme テーブルに該当 id のレコードが存在しない

### 手順
1. 上記いずれかの状態で GET /api/settings/theme/active を呼び出す

### 期待
- ステータスコード: 200
- レスポンスボディ:
```json
{
  "ok": true,
  "active": {
    "themeId": "default",
    ...
  }
}
```

---

## API_SETTINGS_THEME_ACTIVE-TC-04 サーバー内部エラー（DB例外）
### 前提
- ログイン状態/未ログインは問わない
- DB アクセス時に例外が発生する（Prisma のエラーなど）

### 手順
1. GET /api/settings/theme/active 呼び出し時に、DB が例外を投げるようモックする

### 期待
- ステータスコード: 500
- レスポンスボディ:
```json
{
  "ok": false,
  "error": "internal_error"
}
```

---
[目次](../../目次.md) > テストケース集 > テーマ設定API > テーマ有効化状況取得（GET /api/settings/theme/active）
