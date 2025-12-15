[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）

# ログイン2段階認証（POST /api/auth/login/totp）

## 1. 概要
`/api/auth/login` で ID/パスワード認証が通り、かつ TOTP が有効なユーザーに対して、
2段階目（TOTP またはリカバリコード）を検証しログインを完了する API。

- 認証は Cookie `sid` を使用（前段 `/api/auth/login` が `sid` を発行済み）
- 入力 `code` は以下のいずれか
  - TOTP 6桁コード（数字6桁）
  - リカバリコード（例: `ABCD-1234` の形式）
- リカバリコードは **1回使用したら無効化**（DBから削除/フラグ化）

## 2. エンドポイント
- Method: POST
- Path: /api/auth/login/totp

## 3. 認可
- 要ログイン相当（Cookie `sid` 必須）
  - ただし「TOTP未完了の仮ログイン状態」でも呼べる設計とする（実装依存）

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
  - 6桁数字（TOTP）またはリカバリコード形式

## 5. レスポンス

### 5.1 正常（200 OK）
```json
{ "ok": true }
```

### 5.2 異常（代表）
- 400 Bad Request
  - code 未指定 / 空文字 / 形式不正
- 401 Unauthorized
  - 未ログイン / セッション無効
  - code 不一致（TOTP/リカバリコードともに）
- 409 Conflict
  - TOTP が未有効（`totpEnabled=false`）
- 429 Too Many Requests 相当（任意）
  - 連続失敗（`totpFailCount` によりロック）※実装が持っている場合
- 500 Internal Server Error

## 6. DB 更新（期待）
- TOTP 成功時
  - `totpFailCount` を 0 に戻す（実装依存）
- リカバリコード成功時
  - 使用したコードを `User.recoveryCodes` から除去（1回限り）
- 失敗時
  - `totpFailCount` を増加（実装依存）
  - 必要なら `lockUntil` を設定（実装依存）

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）
