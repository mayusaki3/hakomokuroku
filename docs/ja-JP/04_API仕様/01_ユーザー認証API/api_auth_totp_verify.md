[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）

# TOTP有効化確認（POST /api/auth/totp/verify）

## 1. 概要
`/api/auth/totp/setup` で発行した「セットアップ中の一時秘密鍵（pending）」を用いて、
ユーザーが入力した TOTP コードを検証し、正しければ TOTP を **有効化**する API。

- 認証は Cookie `sid` を使用（Bearer は使用しない）
- 有効化に成功したら
  - `totpEnabled=true`
  - `totpSecretEnc` に確定保存
  - `totpPendingSecretEnc` / `totpPendingAt` をクリア
  - `recoveryCodes` を **10個発行**し返す（返却はこのレスポンスのみ）

## 2. エンドポイント
- Method: POST
- Path: /api/auth/totp/verify

## 3. 認可
- 要ログイン（Cookie `sid`）

## 4. リクエスト

### 4.1 ヘッダー
- Content-Type: application/json（必須）
- Cookie: sid=...（必須）

### 4.2 ボディ
```json
{
  "code": "123456"
}
```

- code（必須）
  - 6桁数字（文字列）

## 5. レスポンス

### 5.1 正常（200 OK）
```json
{
  "ok": true,
  "enabled": true,
  "recoveryCodes": [
    "ABCD-1234",
    "EFGH-5678"
  ]
}
```

- enabled: true（有効化完了）
- recoveryCodes
  - 10個
  - 返却はこのレスポンスのみ（サーバーから再表示しない）

### 5.2 異常（代表）
- 400 Bad Request
  - code 未指定/空/形式不正
- 401 Unauthorized
  - 未ログイン
- 409 Conflict
  - setup 未実行（`totpPendingSecretEnc` が無い等）
  - 既に有効化済み（`totpEnabled=true`）
- 422 Unprocessable Entity
  - code 検証失敗
- 500 Internal Server Error

## 6. DB 更新（期待）
- `totpEnabled=true`
- `totpSecretEnc` 設定
- `totpPendingSecretEnc` / `totpPendingAt` クリア
- `recoveryCodes` を新規セットに置換（保存は検証用形式）
- `totpFailCount` は必要なら 0 に戻す（実装依存）

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）
