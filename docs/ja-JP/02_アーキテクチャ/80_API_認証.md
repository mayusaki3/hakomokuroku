[目次](../目次.md) > アーキテクチャ > API設計 > 認証API

# 認証API

## 1. 目的

箱目録v0.8のUser（利用者）登録、login、logout、session確認、TOTP、Recovery Codeを扱うHTTP APIを定義する。

本書を認証APIの正規仕様とし、既存実装と異なる場合は実装を本書へ合わせる。

## 2. 共通

認証APIのJSON responseは原則として次の形式を使用する。

成功:

```json
{ "ok": true }
```

失敗:

```json
{ "ok": false, "error": "<errorCode>" }
```

JSON bodyを要求するAPIは `Content-Type: application/json` を必須とする。

User IDは入力時に前後空白を除去する。

passwordはtrimしない。

認証失敗時にUserの存在有無、password/TOTP/Recovery Codeのどれが誤っていたかを外部へ詳細表示しない。

## 3. User登録

### POST /api/auth/register

request:

```json
{
  "userId": "string",
  "password": "string"
}
```

成功:

```text
200
{ "ok": true }
```

登録成功時にsessionを発行しない。

登録後はlogin画面へ遷移し、利用者が新しいUser ID / passwordでloginする。

TOTP設定をUser登録の必須工程にしない。

主なerror:

- `400 invalid_request`: JSON不正、必須field不正
- `409 already_exists`: User IDが既に存在
- `500 internal_error`: server内部エラー

## 4. Password login

### POST /api/auth/login

request:

```json
{
  "userId": "string",
  "password": "string"
}
```

User ID / passwordが不正な場合:

```text
401
{ "ok": false, "error": "unauthorized" }
```

### 4.1 TOTP無効User

password認証成功時にsessionを発行する。

response:

```json
{
  "ok": true,
  "mfaRequired": false
}
```

### 4.2 TOTP有効User

password認証だけではsessionを発行しない。

短時間有効なLoginChallengeを作成する。

response:

```json
{
  "ok": true,
  "mfaRequired": true,
  "challengeId": "<LoginChallenge.id>"
}
```

clientはTOTP loginへ進む。

## 5. TOTP / Recovery Code login

### POST /api/auth/login/totp

requestはchallengeIdと、TOTP codeまたはRecovery Codeのいずれかを持つ。

TOTP:

```json
{
  "challengeId": "string",
  "code": "123456"
}
```

Recovery Code:

```json
{
  "challengeId": "string",
  "recoveryCode": "XXXX-XXXX"
}
```

成功時:

1. LoginChallengeを使用済みにする。
2. Recovery Code使用時は該当codeを同一transactionで消費する。
3. sessionを発行する。
4. lastLoginAt等の認証状態を更新する。

response:

```json
{
  "ok": true
}
```

Recovery Codeは1回だけ使用可能。

同一challengeを再利用できない。

## 6. Emergency Recovery Code

通常loginで利用できる認証手段:

1. password + TOTP
2. password + Recovery Code

Recovery Codeを紛失または使い切った場合、server administratorがCLIからEmergency Recovery Codeを発行できる。

Emergency Recovery Code:

- server管理者だけが発行できる。
- 発行対象User IDを明示的に指定する。
- 1回だけ使用可能。
- 短時間のみ有効。
- serverにはhashだけを保存する。
- passwordを変更しない。
- TOTP secretを表示または変更しない。
- Emergency Recovery Codeだけではloginできず、User passwordも必要。

Emergency Recovery Codeによる認証成功後、利用者はTOTPを再設定し、新しいRecovery Codesを発行する。

Emergency Recovery Code発行用の一般利用者向けWeb APIは設けない。

## 7. Logout

### POST /api/auth/logout

現在のsessionを失効させる。

logoutは冪等とし、既にsessionが無い場合も成功扱いとする。

response:

```json
{
  "ok": true
}
```

logoutはlocal Business / Outbox / photoを削除しない。

local User bindingを解除し、server操作を停止する。

## 8. Session確認

### GET /api/auth/me

cacheしない。

login済み:

```json
{
  "ok": true,
  "user": {
    "id": "string",
    "userId": "string"
  }
}
```

未login、session失効:

```json
{
  "ok": false,
  "user": null
}
```

## 9. TOTP setup

### POST /api/auth/totp/setup

login必須。

TOTP未設定Userにpending secretを作成し、Authenticatorへ登録するための情報を返す。

既にTOTP有効の場合は `409 conflict`。

TOTP secretは平文でDBへ保存しない。

## 10. TOTP verify / enable

### POST /api/auth/totp/verify

request:

```json
{
  "code": "123456"
}
```

pending secretに対してcodeを検証する。

成功時:

1. pending secretを正式secretへ昇格する。
2. TOTPを有効化する。
3. Recovery Codesを新規発行する。
4. Recovery Codesは平文をこのresponseでのみ返す。
5. serverにはhashを保存する。

## 11. TOTP status

TOTP設定状態の確認はlogin済みUser自身のAccount画面と、LoginChallenge中の必要情報で用途を分離する。

一般のTOTP設定状態を確認するAPIはauthenticated Userを対象とする。

LoginChallengeに必要なRecovery Code残数等を返す場合はchallenge専用APIとして扱い、User情報を過剰に公開しない。

## 12. Recovery Code再発行

### POST /api/auth/totp/recovery/reissue

login必須。

TOTP codeによる再認証を要求する。

成功時:

- 旧Recovery Codesをすべて失効する。
- 新しいRecovery Codesを発行する。
- serverにはhashだけを保存する。
- 平文はresponseで1回だけ返す。

## 13. TOTP無効化

### POST /api/auth/totp/disable

login必須。

TOTP codeまたは未使用Recovery Codeによる再認証を要求する。

成功時:

- TOTPを無効化する。
- TOTP secret / pending secretを削除する。
- Recovery Codesをすべて失効する。
- TOTP failure stateをresetする。

Recovery Codeを使用した場合は、認証と無効化を同一transactionで処理する。

## 14. SessionとCookie

認証sessionを表すCookie名とsession保存方式は1方式へ統一する。

`sid` と `hk_token` のように複数方式を混在させない。

Cookieは少なくとも次を満たす。

- HttpOnly
- SameSite=Lax以上
- production HTTPSではSecure
- Path=/

logoutでは使用中の認証Cookieを確実に失効させる。

## 15. Error mapping

認証APIで使用する主なerror code:

| HTTP | error | 意味 |
| --- | --- | --- |
| 400 | invalid_request | request形式不正 |
| 400 | auth_failed | TOTP等の追加認証失敗 |
| 401 | unauthorized | 未認証または認証失敗 |
| 404 | not_found | 有効なchallenge等が存在しない |
| 409 | already_exists | User ID重複 |
| 409 | conflict | 現在状態では操作不可 |
| 429 | too_many_attempts | 認証試行制限 |
| 500 | internal_error | server内部エラー |

同じ意味に `bad_request` / `invalid_request`、`server_error` / `internal_error` 等の複数error codeを使用しない。

## 16. 現行実装との差分

v0.8実装時に少なくとも次を解消する。

- password loginがTOTP有効Userでも直接sessionを発行している。
- password loginがdummy `sid` を発行している。
- TOTP loginは別方式の `hk_token` を発行している。
- logoutが `sid` のみを削除している。
- server auth utilityに固定User IDを返す暫定実装がある。
- Recovery Code field名が実装内で統一されていない。
- error codeに `bad_request` / `invalid_request`、`server_error` / `internal_error` が混在している。
- Emergency Recovery Codeが未実装。

これらは現行実装の互換性を維持せず、本書のv0.8仕様へ統一する。

[目次](../目次.md) > アーキテクチャ > API設計 > 認証API
