[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP無効化（POST /api/auth/totp/disable）

# テストケース：TOTP無効化（POST /api/auth/totp/disable）

## 1. 前提

- Base URL: /api/auth/totp/disable
- 認証はセッション Cookie `sid`（未ログインは 401）
- prisma.user をモックして状態を制御する
  - totpEnabled / totpSecretEnc / recoveryCodes / totpFailCount / lockUntil
- 本APIは「TOTP を無効化」する
  - totpEnabled=false
  - totpSecretEnc を消す（null）
  - recoveryCodes を消す（null or [] は実装ポリシーで確定）
  - totpFailCount を 0 に戻す（実装ポリシーで確定）

## 2. テストケース一覧

- AUTH_TOTP_DISABLE-TC-01 正常：code 指定で無効化（204）
- AUTH_TOTP_DISABLE-TC-02 正常：recoveryCode 指定で無効化（204）
- AUTH_TOTP_DISABLE-TC-03 異常：未ログイン（401）
- AUTH_TOTP_DISABLE-TC-04 異常：Content-Type 不正（400）
- AUTH_TOTP_DISABLE-TC-05 異常：JSON パース不正（400）
- AUTH_TOTP_DISABLE-TC-06 異常：code / recoveryCode 両方未指定（400）
- AUTH_TOTP_DISABLE-TC-07 異常：code 形式不正（400）
- AUTH_TOTP_DISABLE-TC-08 異常：recoveryCode 形式不正（400）
- AUTH_TOTP_DISABLE-TC-09 異常：TOTP未有効（409）
- AUTH_TOTP_DISABLE-TC-10 異常：検証失敗（401/422）
- AUTH_TOTP_DISABLE-TC-11 異常：ロック中（429）
- AUTH_TOTP_DISABLE-TC-12 異常：DB例外（500相当）

## 3. テストケース詳細

### AUTH_TOTP_DISABLE-TC-01 正常：code 指定で無効化（204）

- 前提
  - requireUserId -> "U1"
  - prisma.user.findUnique -> { id:"U1", totpEnabled:true, totpSecretEnc:"...", ... }
  - code 検証OK（実装の verify 関数をモック）
  - prisma.user.update -> 成功
- 入力
  - Headers: Content-Type=application/json
  - Body: { "code":"123456" }
- 期待結果
  - status=204（ボディなし）
  - prisma.user.update が呼ばれ、TOTP情報が無効化される

### AUTH_TOTP_DISABLE-TC-02 正常：recoveryCode 指定で無効化（204）

- 前提
  - requireUserId -> "U1"
  - recoveryCodes に一致する（照合OK）
  - prisma.user.update -> 成功
- 入力
  - Headers: Content-Type=application/json
  - Body: { "recoveryCode":"RC-PLAIN-1" }
- 期待結果
  - status=204
  - prisma.user.update が呼ばれ、TOTP情報が無効化される

### AUTH_TOTP_DISABLE-TC-03 異常：未ログイン（401）

- 前提：requireUserId が 401 相当を throw
- 期待結果：status=401 相当

### AUTH_TOTP_DISABLE-TC-04 異常：Content-Type 不正（400）

- 入力：Content-Type 未指定、または text/plain
- 期待結果：status=400

### AUTH_TOTP_DISABLE-TC-05 異常：JSON パース不正（400）

- 入力：Body="{" など
- 期待結果：status=400

### AUTH_TOTP_DISABLE-TC-06 異常：code / recoveryCode 両方未指定（400）

- 入力例：{} / { "code":null } / { "recoveryCode":null }
- 期待結果：status=400

### AUTH_TOTP_DISABLE-TC-07 異常：code 形式不正（400）

- 入力例：{ "code":"abc123" } / { "code":"12345" }
- 期待結果：status=400

### AUTH_TOTP_DISABLE-TC-08 異常：recoveryCode 形式不正（400）

- 入力例：{ "recoveryCode":"" } / { "recoveryCode":123 }
- 期待結果：status=400

### AUTH_TOTP_DISABLE-TC-09 異常：TOTP未有効（409）

- 前提：prisma.user.findUnique -> { totpEnabled:false }
- 入力：{ "code":"123456" }（形式OK）
- 期待結果：status=409

### AUTH_TOTP_DISABLE-TC-10 異常：検証失敗（401/422）

- 前提：totpEnabled=true だが code / recoveryCode の照合が失敗
- 期待結果：status は [401, 422] のどちらか（実装に合わせて確定）

### AUTH_TOTP_DISABLE-TC-11 異常：ロック中（429）

- 前提：lockUntil が未来、または failCount が閾値超
- 期待結果：status=429

### AUTH_TOTP_DISABLE-TC-12 異常：DB例外（500相当）

- 前提：prisma.user.update 等が throw
- 期待結果：status=500 相当（既定エラー応答に委ねる）

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP無効化（POST /api/auth/totp/disable）
