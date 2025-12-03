[目次](../目次.md) > API仕様 > ユーザー基本設定 (GET/PUT /api/settings/user)

# ユーザー基本設定 (GET/PUT /api/settings/user)

本書はユーザー名・表示名などの基本設定を扱う GET / PUT API 仕様を定義する。

---

# 1. 共通情報

| 属性 | 値 |
|------|-----|
| 認証 | 必須 |
| Content-Type | application/json |
| 戻り値 | { ok: boolean, ... } |

---

# 2. GET /api/settings/user

## 2.1 概要
ログイン中ユーザーの基本設定情報を取得する。

## 2.2 入力
なし。

## 2.3 出力（成功）

```
{
  "ok": true,
  "user": {
    "id": "user_123",
    "displayName": "山田太郎",
    "email": "taro@example.com"
  }
}
```

## 2.4 エラー（未ログイン）

```
{ "ok": false, "error": "unauthorized" }
```

## 2.5 エラー（DB例外）

```
{ "ok": false, "error": "db error" }
```

## 2.6 ステータスコード

| 状態 | ステータス |
|------|------------|
| 成功 | 200 |
| 未ログイン | 401 |
| DB例外 | 500 |

---

# 3. PUT /api/settings/user

## 3.1 概要
ユーザー基本設定（displayName）を更新する。

## 3.2 入力 JSON

```
{
  "displayName": "新しい名前"
}
```

### バリデーション

| 項目 | 条件 | エラー |
|------|------|--------|
| displayName | 1〜50文字 | invalid displayName |

## 3.3 出力（成功）

```
{
  "ok": true,
  "user": {
    "id": "user_123",
    "displayName": "新しい名前"
  }
}
```

## 3.4 エラー（入力不正）

```
{ "ok": false, "error": "invalid displayName" }
```

## 3.5 エラー（DB例外）

```
{ "ok": false, "error": "db error" }
```

---

# 4. ステータスコード

| 状態 | ステータス |
|------|-----------|
| 成功 | 200 |
| 認証なし | 401 |
| 入力不正 | 400 |
| DB例外 | 500 |

---

# 5. 挙動仕様

### 5.1 正常ケース
- requireUserId でログイン確認
- user.update を実行
- 成功時 { ok:true }

### 5.2 DB例外
- { ok:false } + 500 に統一

### 5.3 displayName バリデーション
- 文字列でない
- 長さ 1〜50 以外  
→ 400 を返す

---

# 6. 実装メモ

- 更新フィールドは今後追加予定のため、バリデーションを分離して管理する。

---
[目次](../目次.md) > API仕様 > ユーザー基本設定 (GET/PUT /api/settings/user)
