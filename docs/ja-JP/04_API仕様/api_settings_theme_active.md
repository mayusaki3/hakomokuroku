[目次](../目次.md) > API仕様 > テーマ有効化状況取得（GET /api/settings/theme/active）

# テーマ有効化状況取得（GET /api/settings/theme/active）

## 1. 概要
ユーザーの現在のアクティブテーマを取得する API。

---

## 2. エンドポイント
- GET /api/settings/theme/active

---

## 3. 認証
- 必須（セッショントークン）

---

## 4. レスポンス仕様

### 成功時（200 OK）
```
{
  "ok": true,
  "theme": {
    "id": "default-dark",
    "name": "Dark Theme",
    "wallpaper": "...",
    "colors": { ... }
  }
}
```

### 異常時

| ステータス | 内容 |
|-----------|------|
| 401 | 未ログイン |
| 404 | アクティブテーマなし |
| 500 | サーバー内部エラー |

---

## 5. 振る舞い
1. セッションから userId を取得  
2. UserSetting から themeId を検索  
3. Theme テーブルから詳細情報を取得  
4. レスポンスとして返す  

---

## 6. 関連テストケース
05_テストケース集/20_APIテストケース集/api_settings_theme_active_testcases.md

---
[目次](../目次.md) > API仕様 > テーマ有効化状況取得（GET /api/settings/theme/active）
