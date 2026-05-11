[目次](../../目次.md) > API仕様 > ユーザー認証API > ユーザー登録（POST /api/auth/register）

# ユーザー登録（POST /api/auth/register）

本書は、ユーザー登録 API（POST /api/auth/register）の正式な仕様を定義する。  
※現時点の実装（apps/web/src/app/api/auth/register/route.ts）を正とする。

## 1. 概要

未登録ユーザーを新規作成する。

- 認証不要（未ログインで実行する）
- 成功時は `{ ok:true }` を返す
- 既に同一 userId が存在する場合は 409 を返す
- 登録成功しても **ログイン状態にはならない**（セッションCookieは発行しない）

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_register_request | リクエスト | userId と password を受け取る |
| sec_auth_register_invalid_request | 入力不正 | Content-Type / JSON / 必須項目不正を 400 にする |
| sec_auth_register_conflict | 既存ユーザー | userId 重複を 409 にする |
| sec_auth_register_success | 登録成功 | User を作成し 200 ok:true を返す |
| sec_auth_register_internal_error | 内部エラー | DB 例外などを 500 にする |
| sec_auth_register_security | セキュリティ | password をハッシュ化し、登録後ログイン状態にしない |

---

## 3. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/register |

## 4. リクエスト

### 4.1 ヘッダー {#sec_auth_register_invalid_request}

- Content-Type: application/json（必須）

### 4.2 ボディ（JSON） {#sec_auth_register_request}

```json
{
  "userId": "string",
  "password": "string"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| userId | string | ✅ | ログイン用ID（メール形式を想定するが、厳密な形式チェックは現時点では行わない） |
| password | string | ✅ | 平文パスワード（空文字不可） |

## 5. レスポンス

### 5.1 成功（200） {#sec_auth_register_success}

```json
{ "ok": true }
```

登録成功時はログイン用 Cookie を発行しない。

### 5.2 失敗

| sec_id | 状況 | ステータス | Body |
|---|---|---:|---|
| sec_auth_register_invalid_request | Content-Type が application/json ではない | 400 | `{ "ok": false, "error": "bad_request" }` |
| sec_auth_register_invalid_request | JSON パース不正 | 400 | `{ "ok": false, "error": "bad_request" }` |
| sec_auth_register_invalid_request | userId/password が未指定、空文字、string 以外 | 400 | `{ "ok": false, "error": "bad_request" }` |
| sec_auth_register_conflict | 既に登録済み | 409 | `{ "ok": false, "error": "already_exists" }` |
| sec_auth_register_internal_error | Prisma 例外など | 500 | 実装に委ねる |

## 6. DB 更新 {#sec_auth_register_success}

- User を 1件作成する
  - userId = 入力 userId を trim した値
  - passwordHash = argon2 でハッシュ化した値
  - その他フィールドはスキーマの既定値に従う

## 7. セキュリティ {#sec_auth_register_security}

- password は平文保存しない
- passwordHash のみ保存する
- 登録成功してもログイン状態にはしない
- 既存 userId 判定では入力 userId を trim して扱う

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > ユーザー登録（POST /api/auth/register）
