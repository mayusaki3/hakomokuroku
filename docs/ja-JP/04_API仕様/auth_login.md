[目次](../目次.md) > API仕様 > ログイン（POST /api/auth/login）

# ログイン（POST /api/auth/login）

ユーザーの資格情報を検証し、セッションを作成する API。

---

## 1. 概要

ログインフォームから送信されたメールアドレスとパスワードを検証し、  
成功時にはセッション Cookie を発行する。

---

## 2. リクエスト

### Body(JSON)

```json
{
  "email": "string",
  "password": "string"
}
```

### バリデーション

| 項目 | 条件 |
|------|------|
| email | 必須・メール形式 |
| password | 必須・1文字以上 |

---

## 3. レスポンス

### 成功時（200）

```json
{
  "ok": true,
  "user": {
    "id": "string",
    "displayName": "string"
  }
}
```

Cookie にセッション ID を設定。

---

### 失敗時

| 状況 | ステータス | Body |
|------|------------|-------|
| パラメータ不足 | 400 | { "ok": false, "error": "invalid_request" } |
| メール不一致/パスワード不一致 | 401 | { "ok": false, "error": "auth_failed" } |
| 内部エラー | 500 | { "ok": false, "error": "internal_error" } |

---

## 4. セキュリティ注意点

- ログにはパスワードを記録しない。
- 認証失敗時のメッセージは詳細化しない（メール不一致/パスワード不一致を区別しない）。

---
[目次](../目次.md) > API仕様 > ログイン（POST /api/auth/login）
