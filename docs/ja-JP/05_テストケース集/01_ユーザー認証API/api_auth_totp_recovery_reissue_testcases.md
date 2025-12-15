[目次](../../目次.md) > テストケース集 > ユーザー認証API > リカバリコード再発行（POST /api/auth/totp/recovery/reissue）

# テストケース：リカバリコード再発行（POST /api/auth/totp/recovery/reissue）

## 1. 前提
- ベース URL: /api/auth/totp/recovery/reissue
- 認証は Cookie `sid` を使用
- User の状態は DB モックで制御する（`User.totpEnabled` / `User.totpSecretEnc` / `User.recoveryCodes`）

## 2. テストケース一覧
- AUTH_TOTP_RECOVERY_REISSUE-TC-01 正常: TOTP 有効ユーザーが正しい code で再発行（200）
- AUTH_TOTP_RECOVERY_REISSUE-TC-02 異常: 未ログイン（401）
- AUTH_TOTP_RECOVERY_REISSUE-TC-03 異常: code 未指定/空（400）
- AUTH_TOTP_RECOVERY_REISSUE-TC-04 異常: code 形式不正（400）
- AUTH_TOTP_RECOVERY_REISSUE-TC-05 異常: code 検証失敗（422）
- AUTH_TOTP_RECOVERY_REISSUE-TC-06 異常: TOTP 未有効（409）
- AUTH_TOTP_RECOVERY_REISSUE-TC-07 異常: 内部例外（500）
- AUTH_TOTP_RECOVERY_REISSUE-TC-08 正常: 再発行により旧リカバリコードが無効化される（200）

## 3. テストケース詳細

### AUTH_TOTP_RECOVERY_REISSUE-TC-01 正常: TOTP 有効ユーザーが正しい code で再発行（200）
- 前提
  - User A: `totpEnabled=true`
  - `totpSecretEnc` が存在
  - `recoveryCodes` に旧セットが存在（ハッシュ形式）
- 入力
  - Cookie: sid（User A）
  - Body: 正しい `code`
- 期待結果
  - 200
  - `ok:true`
  - `recoveryCodes` が配列
  - `recoveryCodes.length === 10`
  - DB: `User.recoveryCodes` が置換される（旧セットと異なる）

### AUTH_TOTP_RECOVERY_REISSUE-TC-02 異常: 未ログイン（401）
- 入力: Cookie なし
- 期待: 401

### AUTH_TOTP_RECOVERY_REISSUE-TC-03 異常: code 未指定/空（400）
- 入力: {} / {"code":""}
- 期待: 400

### AUTH_TOTP_RECOVERY_REISSUE-TC-04 異常: code 形式不正（400）
- 入力: {"code":"abc123"} / {"code":"12345"} など
- 期待: 400

### AUTH_TOTP_RECOVERY_REISSUE-TC-05 異常: code 検証失敗（422）
- 入力: {"code":"000000"}（形式OKだが不正）
- 期待: 422

### AUTH_TOTP_RECOVERY_REISSUE-TC-06 異常: TOTP 未有効（409）
- 前提: User B `totpEnabled=false`
- 入力: sid（User B）+ 形式OKの code
- 期待: 409

### AUTH_TOTP_RECOVERY_REISSUE-TC-07 異常: 内部例外（500）
- 前提: DB 更新が throw
- 期待: 500

### AUTH_TOTP_RECOVERY_REISSUE-TC-08 正常: 再発行により旧リカバリコードが無効化される（200）
- 前提
  - User A の旧リカバリコード（平文）をテスト側で保持しておく
  - 再発行を実行し新コードを受領
- 手順
  1) reissue 実行（200）
  2) （別APIで検証する想定）ログイン 2段階 `/api/auth/login/totp` で旧リカバリコードを送る
- 期待
  - 2) が 401/422 相当で失敗する（旧コードが無効）

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > リカバリコード再発行（POST /api/auth/totp/recovery/reissue）
