[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）

# テストケース：TOTP有効化確認（POST /api/auth/totp/verify）

## 1. 前提
- ベース URL: /api/auth/totp/verify
- Cookie `sid` によりログイン状態を表現
- `totpPendingSecretEnc` / `totpPendingAt` / `totpEnabled` / `recoveryCodes` を DB モックで制御

## 2. テストケース一覧
- AUTH_TOTP_VERIFY-TC-01 正常: setup 済み + 正しい code（200、recoveryCodes=10）
- AUTH_TOTP_VERIFY-TC-02 異常: code 未指定/空（400）
- AUTH_TOTP_VERIFY-TC-03 異常: code 形式不正（400）
- AUTH_TOTP_VERIFY-TC-04 異常: code 不一致（422）
- AUTH_TOTP_VERIFY-TC-05 異常: 未ログイン（401）
- AUTH_TOTP_VERIFY-TC-06 異常: setup 未実行（409）
- AUTH_TOTP_VERIFY-TC-07 異常: 既に有効化済み（409）

## 3. テストケース詳細

### AUTH_TOTP_VERIFY-TC-01 正常: setup 済み + 正しい code（200、recoveryCodes=10）
- 前提
  - User A: `totpEnabled=false`
  - `totpPendingSecretEnc` あり
  - `totpPendingAt` が有効期限内
- 入力
  - sid（User A）
  - Body: 正しい code
- 期待
  - 200
  - `ok:true`
  - `enabled:true`
  - `recoveryCodes.length === 10`
  - DB: `totpEnabled=true` / `totpSecretEnc` 設定 / `pending` クリア / `recoveryCodes` 保存

### AUTH_TOTP_VERIFY-TC-02 異常: code 未指定/空（400）
- 入力: {} / {"code":""}
- 期待: 400

### AUTH_TOTP_VERIFY-TC-03 異常: code 形式不正（400）
- 入力: {"code":"abc123"} / {"code":"12345"} 等
- 期待: 400

### AUTH_TOTP_VERIFY-TC-04 異常: code 不一致（422）
- 入力: {"code":"000000"}
- 期待: 422

### AUTH_TOTP_VERIFY-TC-05 異常: 未ログイン（401）
- 入力: Cookie なし
- 期待: 401

### AUTH_TOTP_VERIFY-TC-06 異常: setup 未実行（409）
- 前提: `totpPendingSecretEnc` が無い
- 期待: 409

### AUTH_TOTP_VERIFY-TC-07 異常: 既に有効化済み（409）
- 前提: `totpEnabled=true`
- 期待: 409

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）
