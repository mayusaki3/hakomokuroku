[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 無効化（POST /api/auth/totp/disable）

# TOTP 無効化（POST /api/auth/totp/disable）

## 1. 概要

有効化済みの TOTP（二要素認証）を **解除（無効化）**する API。

- 要ログイン（Cookie `sid` 必須）
- **TOTP コード または リカバリコードの検証が必須**
- 成功時は **204 No Content**
- リカバリコードを使用した場合は **1 回で失効**

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/totp/disable |

## 3. 認可

- 要ログイン（Cookie `sid` 必須）

## 4. リクエスト

### 4.1 ヘッダー

| 項目 | 必須 | 説明 |
|------|------|------|
| Cookie | 必須 | sid={セッションID} |
| Content-Type | 必須 | application/json |

### 4.2 ボディ

```json
{
  "code": "123456",
  "recoveryCode": null
}
```

- code
  - TOTP 6 桁コード
- recoveryCode
  - リカバリコード（例: `ABCD-1234`）
- **code または recoveryCode のどちらか一方は必須**
- 両方指定されている場合は `code` を優先（実装依存）

## 5. レスポンス

### 5.1 正常（204 No Content）

- Body：なし

### 5.2 異常

| 状態 | ステータス | Body |
|------|-----------|------|
| Content-Type 不正 | 400 | ```json { "error": "bad_request" } ``` |
| 入力不備（code / recoveryCode 両方なし） | 400 | ```json { "error": "bad_request" } ``` |
| TOTP 未有効 | 400 | ```json { "error": "not_enabled" } ``` |
| 検証失敗 | 400 | ```json { "error": "invalid" } ``` |
| 未ログイン | 401 | ```json { "error": "unauthorized" } ``` |
| レートリミット | 429 | ```json { "error": "too_many_requests" } ``` |
| 内部エラー | 500 | （ボディなし） |

※ 検証失敗時に 401 を返さないのは、  
　「コードが正しいかどうか」を推測させないため。

## 6. DB 更新仕様

### 成功時

- `totpEnabled = false`
- `totpSecretEnc = null`
- `totpPendingSecretEnc = null`
- `totpPendingAt = null`
- `recoveryCodes = null`
- `totpFailCount = 0`

### 失敗時

- TOTP / recoveryCode 不一致の場合
  - `totpFailCount` を +1（実装依存）
- それ以外の DB 状態は変更しない

## 7. 挙動仕様

1. Content-Type が application/json でなければ 400
2. Cookie `sid` を検証  
   - 無効なら 401
3. ユーザーを取得
4. `totpEnabled !== true` の場合は 400（not_enabled）
5. `code` / `recoveryCode` を検証  
   - 両方無ければ 400  
   - 不一致なら 400（invalid）
6. 成功時のみ  
   - TOTP 設定を完全に削除  
   - 204 No Content を返却

## 8. セキュリティ上の注意

- リカバリコードは **使用後即失効**
- 無効化後は再度 `/api/auth/totp/setup` からやり直し
- brute-force 対策は `totpFailCount` 等で制御（実装依存）

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 無効化（POST /api/auth/totp/disable）
