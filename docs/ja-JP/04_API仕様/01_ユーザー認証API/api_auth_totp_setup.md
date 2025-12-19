[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 設定開始（POST /api/auth/totp/setup）

# TOTP 設定開始（POST /api/auth/totp/setup）

本書は、TOTP による二要素認証の  
**設定開始 API（POST /api/auth/totp/setup）** の正式な仕様を定義する。

## 1. 概要

ログイン中ユーザーに対して、TOTP 設定用のシークレットを新規に生成し、  
認証アプリで読み込むための **otpauth:// URL** を返却する。

- 要ログイン（Cookie `sid` により判定）
- すでに TOTP が有効なユーザーには設定開始を許可しない
- 成功時は **200 OK + otpauthUrl**

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/totp/setup |

## 3. 入力

### 3.1 リクエストヘッダ

| 項目 | 必須 | 説明 |
|------|------|------|
| Cookie | 必須 | sid={セッションID} |
| Content-Type | 任意 | 指定不要（ボディなし） |

### 3.2 ボディ

なし。

## 4. 出力（レスポンス）

### 4.1 成功（200 OK）

```json
{
  "ok": true,
  "otpauthUrl": "otpauth://totp/..."
}
```

- otpauthUrl
  - 認証アプリ（Google Authenticator 等）に登録するための URL
  - QR コード生成はクライアント側で行う

### 4.2 失敗

| 状態 | ステータス | Body |
|------|-----------|------|
| 未ログイン | 401 | ```json { "ok": false, "error": "unauthorized" } ``` |
| ユーザー不明 | 404 | ```json { "ok": false, "error": "not_found" } ``` |
| 既に TOTP 有効 | 400 | ```json { "ok": false, "error": "already_enabled" } ``` |
| 内部エラー | 500 | （ボディなし） |

## 5. ステータスコード一覧

| 状態 | ステータス |
|------|-----------|
| 正常 | 200 |
| 未ログイン | 401 |
| 業務エラー | 400 |
| ユーザー不明 | 404 |
| 内部エラー | 500 |

## 6. 挙動仕様

1. Cookie `sid` からログイン中ユーザーを取得  
   - 取得できない場合は 401
2. ユーザー情報を DB から取得  
   - 存在しない場合は 404
3. `totpEnabled === true` の場合は 400（already_enabled）
4. 新しい TOTP シークレットを生成
5. シークレットを環境鍵で暗号化し、以下を DB に保存
   - `totpPendingSecretEnc`
   - `totpPendingAt`
   - `totpFailCount = 0`
6. otpauth:// URL を生成
7. 200 OK + { ok: true, otpauthUrl } を返却

## 7. セキュリティ・設計上の注意

- 本 API は **TOTP 有効化前の準備専用**
- 実際の有効化は `/api/auth/totp/verify` で行う
- 平文シークレットはレスポンスや DB に保存しない
- 暗号鍵（`TOTP_SECRET_KEY`）が未設定の場合は 500 となる

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 設定開始（POST /api/auth/totp/setup）
