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

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/register |

## 3. リクエスト

### 3.1 ヘッダー

- Content-Type: application/json（必須）

### 3.2 ボディ（JSON）

```json
{
  "userId": "user@example.com",
  "password": "P@ssw0rd"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| userId | string | ✅ | ログイン用ID（メール形式を想定するが、厳密な形式チェックは現時点では行わない） |
| password | string | ✅ | 平文パスワード（空文字不可） |

## 4. レスポンス

### 4.1 成功（200）

```json
{ "ok": true }
```

### 4.2 失敗

#### 400 Bad Request（入力不正 / Content-Type 不正 / JSON不正）

- 例：Content-Type が application/json ではない
- 例：userId/password が未指定、空文字、string 以外

```json
{ "ok": false, "error": "bad_request" }
```

#### 409 Conflict（既に登録済み）

```json
{ "ok": false, "error": "already_exists" }
```

#### 500 Internal Server Error（サーバー内部例外）

- Prisma 例外などの予期せぬエラー

（レスポンス形式は Next.js 実行時の既定エラー応答に委ねる）

## 5. DB 更新

- User を 1件作成する
  - userId = 入力 userId
  - passwordHash = argon2 でハッシュ化した値
  - その他フィールドはスキーマの既定値に従う

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > ユーザー登録（POST /api/auth/register）
