[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 設定開始（POST /api/auth/totp/setup）

# TOTP 設定開始（POST /api/auth/totp/setup）

本書は、TOTP による二要素認証の「設定開始 API」（POST /api/auth/totp/setup）の正式な仕様を定義する。

## 1. 概要

ログイン中ユーザーに対して、TOTP 設定用のシークレットを発行し、
認証アプリで読み込むための otpauth:// URL を返す。

- 要ログイン（sid Cookie で判定）
- すでに TOTP 有効なユーザーには設定開始を許可しない
- 成功時は 200 + { ok:true, otpauthUrl }

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/totp/setup |

## 3. 入力

### 3.1 リクエストヘッダ

| 項目 | 必須 | 値 |
|------|------|------|
| Cookie | 任意 | sid={セッションID} |
| Content-Type | 任意 | なし（ボディ無し） |

### 3.2 ボディ

なし。

## 4. 出力（レスポンス）

### 4.1 成功

```json
{
  "ok": true,
  "otpauthUrl": "otpauth://totp/…"
}
```

- otpauthUrl は認証アプリの読み込み用 URL。

### 4.2 失敗例

| 状態 | ステータス | Body 例 |
|------|-----------|---------|
| 未ログイン | 401 | { "ok": false, "error": "unauthorized" } |
| 既に TOTP 有効 | 400 | { "ok": false, "error": "already_enabled" } |
| レートリミット | 429 | { "ok": false, "error": "too_many_requests" } |
| 内部エラー | 500 | { "ok": false, "error": "internal_error" } |

## 5. ステータスコード

| 状態 | ステータス |
|------|-----------|
| 正常 | 200 |
| 認証エラー | 401 |
| 業務エラー | 400 |
| レートリミット | 429 |
| 内部エラー | 500 |

## 6. 挙動仕様

1. sid Cookie からログイン中ユーザーを取得。無効なら 401。
2. 既に TOTP 有効なら 400。
3. 新規 TOTP シークレットを生成。
4. otpauth:// URL を生成。
5. DB に TOTP 情報を保存。
6. 200 + { ok:true, otpauthUrl } を返す。

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 設定開始（POST /api/auth/totp/setup）
