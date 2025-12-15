[目次](../../目次.md) > API仕様 > ユーザー認証API > リカバリコード再発行（POST /api/auth/totp/recovery/reissue）

# リカバリコード再発行（POST /api/auth/totp/recovery/reissue）

## 1. 概要
TOTP を有効化済みのユーザーに対して、リカバリコードを **再発行**する API。

- 再発行すると **旧リカバリコードは全て無効化**される
- 新しいリカバリコードは **10 個**返す
- リカバリコードは DB には **平文保存しない**（`User.recoveryCodes` にはハッシュ等の検証可能形式で保存する）
- 本 API の実行には **TOTP による本人確認**が必須（= `code` を要求）

## 2. エンドポイント
- Method: POST
- Path: /api/auth/totp/recovery/reissue

## 3. 認可
- 要ログイン（Cookie `sid` によりセッション識別）
- Content-Type: application/json（必須）

※ Authorization: Bearer は使用しない（本プロジェクトの認証は Cookie `sid` に統一）

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
  - TOTP 認証アプリが生成した 6 桁コード（文字列）

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
  - 新規発行された 10 個のリカバリコード
  - 返却はこのレスポンスのみ（以後サーバーから再表示しない）

### 5.2 異常（代表）
- 400 Bad Request
  - code 未指定 / 空文字 / 形式不正（6桁数字でない）
- 401 Unauthorized
  - 未ログイン / セッション無効
- 409 Conflict
  - TOTP 未有効（`User.totpEnabled=false`）
  - TOTP セットアップ未完了（`totpSecretEnc` が存在しない等）
- 422 Unprocessable Entity
  - code は形式OKだが検証失敗（不正/期限外）
- 500 Internal Server Error
  - 予期せぬ例外

## 6. DB 更新（期待）
- `User.recoveryCodes` を新しいセットに置換
- 旧セットは無効化（= 検証できない状態にする）
- 監査目的で必要なら `User.updatedAt` が更新される

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > リカバリコード再発行（POST /api/auth/totp/recovery/reissue）
