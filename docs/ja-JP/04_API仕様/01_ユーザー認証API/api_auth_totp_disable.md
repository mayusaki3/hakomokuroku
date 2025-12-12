[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 無効化（POST /api/auth/totp/disable）

# TOTP 無効化（POST /api/auth/totp/disable）

本書は、TOTP 認証を無効化する API の仕様を定義する。

## 1. 概要

- 要ログイン（sid 必須）
- TOTP コード or リカバリコードの検証が必要
- 成功時は 204 No Content

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/totp/disable |

## 3. 入力

### 3.1 ヘッダ
| 項目 | 必須 | 値 |
|------|------|------|
| Cookie | 必須 | sid={セッションID} |
| Content-Type | 必須 | application/json |

### 3.2 ボディ
```json
{
  "code": "123456",
  "recoveryCode": null
}
```

- code または recoveryCode のどちらかは必須。

## 4. 出力（レスポンス）

### 4.1 成功
- ステータス：204
- Body：なし

### 4.2 失敗

| 状態 | ステータス | Body 例 |
|------|-----------|---------|
| 未ログイン | 401 | { "error": "unauthorized" } |
| 入力不備 | 400 | { "error": "invalid_request" } |
| 検証失敗 | 401 | { "error": "invalid_code" } |
| レートリミット | 429 | { "error": "too_many_requests" } |
| 内部エラー | 500 | { "error": "internal_error" } |

## 5. ステータスコード

| 状態 | ステータス |
|------|-----------|
| 正常 | 204 |
| 入力/認証エラー | 400/401 |
| レートリミット | 429 |
| 内部エラー | 500 |

## 6. 挙動仕様

1. sid Cookie を検証。なければ 401。
2. code / recoveryCode を取得。どちらも無い → 400。
3. TOTP or リカバリコード検証。不一致 → 401。
4. DB の TOTP 設定を削除/無効化。
5. 204 No Content を返却。

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 無効化（POST /api/auth/totp/disable）
