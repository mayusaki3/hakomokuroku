[目次](../目次.md) > APIテストケース集 > テーマ有効化状況取得（GET /api/settings/theme/active）

# テストケース：テーマ有効化状況取得（GET /api/settings/theme/active）

## API_SETTINGS_THEME_ACTIVE-TC-01 正常取得
### 前提
- userId=xxx  
- UserSetting.themeId="default-dark"

### 期待
```
{
  "ok": true,
  "theme": { "id": "default-dark", ... }
}
```

---

## API_SETTINGS_THEME_ACTIVE-TC-02 アクティブテーマなし
### 前提
- UserSetting.themeId が null

### 期待
- 404 Not Found

---

## API_SETTINGS_THEME_ACTIVE-TC-03 未ログイン
### 期待
- 401 Unauthorized

---

## API_SETTINGS_THEME_ACTIVE-TC-04 テーマ情報が破損
### 条件
- themeId に対応する Theme レコードなし

### 期待
- 404 Not Found

---

## API_SETTINGS_THEME_ACTIVE-TC-05 サーバー内部エラー
### 条件
- DB 接続エラー

### 期待
- 500 Internal Server Error

---
[目次](../目次.md) > APIテストケース集 > テーマ有効化状況取得（GET /api/settings/theme/active）
