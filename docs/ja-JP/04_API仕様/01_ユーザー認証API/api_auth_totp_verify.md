[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）

# TOTP有効化確認（POST /api/auth/totp/verify）

## 1. 概要

`/api/auth/totp/setup` で発行した  
**セットアップ中の一時秘密鍵（pending）** を用いて、  
ユーザーが入力した TOTP コードを検証し、正しければ TOTP を **有効化**する API。

- 認証は Cookie `sid` を使用（Bearer トークンは使用しない）
- 有効化に成功した場合、以下を実施する
  - `totpEnabled = true`
  - `totpSecretEnc` に確定保存
  - `totpPendingSecretEnc` / `totpPendingAt` をクリア
  - **リカバリコードを 10 個生成し返却**
    - 返却はこのレスポンスのみ（再取得不可）

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/totp/verify |

## 3. 認可

- 要ログイン（Cookie `sid` 必須）

## 4. リクエスト

### 4.1 ヘッダー

| 項目 | 必須 | 説明 |
|------|------|------|
| Content-Type | 必須 | application/json |
| Cookie | 必須 | sid={セッションID} |

### 4.2 ボディ

```json
{
  "code": "123456"
}
```

- code（必須）
  - 数字 6 桁の文字列
  - 形式不正・未指定はエラー

## 5. レスポンス

### 5.1 正常（200 OK）

```json
{
  "ok": true,
  "recoveryCodes": [
    "ABCD-1234",
    "EFGH-5678"
  ]
}
```

- recoveryCodes
  - 件数：10
  - **このレスポンスでのみ返却**
  - サーバー側から再表示・再取得は不可

### 5.2 異常

| 状態 | ステータス | Body |
|------|-----------|------|
| Content-Type 不正 / JSON 不正 | 400 | ```json { "ok": false, "error": "bad_request" } ``` |
| code 形式不正 | 400 | ```json { "ok": false, "error": "bad_request" } ``` |
| setup 未実行 | 400 | ```json { "ok": false, "error": "setup_not_started" } ``` |
| code 不一致 | 400 | ```json { "ok": false, "error": "invalid" } ``` |
| 既に TOTP 有効 | 400 | ```json { "ok": false, "error": "already_enabled" } ``` |
| 未ログイン | 401 | ```json { "ok": false, "error": "unauthorized" } ``` |
| ユーザー不明 | 404 | ```json { "ok": false, "error": "not_found" } ``` |
| 内部エラー | 500 | （ボディなし） |

## 6. DB 更新仕様

### 成功時

- `totpEnabled = true`
- `totpSecretEnc = totpPendingSecretEnc`
- `totpPendingSecretEnc = null`
- `totpPendingAt = null`
- `totpFailCount = 0`
- `recoveryCodes`
  - 新規 10 件を生成し保存

### 失敗時

- code 不一致の場合
  - `totpFailCount` を +1
- DB 状態はそれ以外変更しない

## 7. 挙動仕様

1. Content-Type が application/json でなければ 400
2. Cookie `sid` からログインユーザーを取得  
   - 取得不可なら 401
3. ユーザーを DB から取得  
   - 存在しなければ 404
4. `totpEnabled === true` の場合は 400（already_enabled）
5. `totpPendingSecretEnc` が存在しなければ 400（setup_not_started）
6. 入力 code を検証  
   - 不一致なら `totpFailCount++` → 400（invalid）
7. 成功時のみ
   - TOTP を有効化
   - リカバリコードを生成
   - 200 OK を返却

## 8. セキュリティ上の注意

- リカバリコードは **平文返却は 1 回のみ**
- 再表示 API は存在しない
- 有効化後は再度 `/api/auth/totp/setup` を実行できない
- brute-force 防止は `totpFailCount` により制御（実装依存）

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）
