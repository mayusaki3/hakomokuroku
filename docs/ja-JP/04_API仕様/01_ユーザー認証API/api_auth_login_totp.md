<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-090000Z-AULTP
lang: ja-JP
canonical_title: ログイン2段階認証（POST /api/auth/login/totp）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）

# ログイン2段階認証（POST /api/auth/login/totp）

本書は、ログイン2段階認証 API（POST /api/auth/login/totp）の正式な仕様を定義する。  
本書は目標API契約を定義する。現行実装（apps/web/src/app/api/auth/login/totp/route.ts）と旧Vitestには未対応・不一致があるため、末尾の実装差分を参照する。

---

## 1. 概要

`/api/auth/login` による ID/パスワード認証後、TOTP が有効なユーザーに対して 2 段階目の認証を行い、ログインを完了させる API。

- 前段の処理で発行された `LoginChallenge.id` を `challengeId` として受け取る
- Cookie 認証は不要
- `challengeId` に紐づくユーザーを取得する
- TOTP code または recoveryCode を検証する
- 認証成功時のみ `LoginChallenge.used=true` に更新し、ログイン用 Cookie を発行する
- 認証失敗や challenge 不正は 4xx で返し、予期しない例外は 500 で返す

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_login_totp_invalid_request | 不正リクエスト | Content-Type / JSON / body / 必須項目不正を 400 にする |
| sec_auth_login_totp_request | リクエスト | challengeId と code / recoveryCode を受け取る |
| sec_auth_login_totp_challenge_validation | challenge 検証 | challenge 不存在 / 期限切れ / 使用済み / ユーザー不在を拒否する |
| sec_auth_login_totp_locked | ロック・試行制限 | lockUntil が未来、または試行回数超過を拒否する |
| sec_auth_login_totp_invalid_code | 認証コード不一致 | code / recoveryCode 不一致を 400 auth_failed にする |
| sec_auth_login_totp_success | 認証成功 | 正しい TOTP / recoveryCode でログインを完了する |
| sec_auth_login_totp_internal_error | 内部エラー | 予期しない例外を 500 にする |
| sec_auth_login_totp_security | セキュリティ | challengeId / recoveryCode / Cookie を安全に扱う |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/login/totp |

---

## 4. 認可・前提条件 {#sec_auth_login_totp_challenge_validation}

- Cookie 認証は不要
- `challengeId` が有効であること
  - `LoginChallenge` が存在する
  - `used=false`
  - `expiresAt > now()`
- `LoginChallenge.userId` に対応するユーザーが存在すること
- ユーザーの `totpEnabled=true` かつ `totpSecretEnc` が存在すること

---

## 5. リクエスト

### 5.1 ヘッダー {#sec_auth_login_totp_invalid_request}

```txt
Content-Type: application/json
```

### 5.2 Body(JSON) {#sec_auth_login_totp_request}

```json
{
  "challengeId": "C1",
  "code": "123456",
  "recoveryCode": "ABCD-1234"
}
```

| 項目 | 条件 | 不正時 |
|---|---|---|
| challengeId | 必須 | 400 invalid_request |
| code | 任意。全角数字は半角数字へ正規化し、数字6桁として検証する | 400 auth_failed |
| recoveryCode | 任意。文字列の場合のみ trim して使用する | 400 auth_failed |

`code` または `recoveryCode` の少なくとも一方を文字列で指定する。両方とも欠落した場合は400 `invalid_request`。

---

## 6. レスポンス

### 6.1 正常 {#sec_auth_login_totp_success}

```json
{
  "ok": true
}
```

- HTTP 200
- `Set-Cookie` に `hk_session` と `hk_device` を設定する。MFA完了前にはどちらも発行しない
- `AuthSession` は固定30日有効、DBには平文tokenではなくSHA-256 digestを保存する

### 6.2 不正リクエスト {#sec_auth_login_totp_invalid_request}

```json
{
  "ok": false,
  "error": "invalid_request"
}
```

- HTTP 400

### 6.3 challenge 不正 {#sec_auth_login_totp_challenge_validation}

```json
{
  "ok": false,
  "error": "not_found"
}
```

- HTTP 404
- challenge 不存在、使用済み、期限切れ、ユーザー不在を詳細化しない

### 6.4 TOTP 未有効 {#sec_auth_login_totp_invalid_request}

```json
{
  "ok": false,
  "error": "not_enabled"
}
```

- HTTP 400

### 6.5 認証失敗 {#sec_auth_login_totp_invalid_code}

```json
{
  "ok": false,
  "error": "auth_failed"
}
```

- HTTP 400
- 有効challengeに対する誤ったTOTP/Recovery Codeは、MFAログイン専用の永続化カウンターを加算する（既存 `User.totpFailCount` とは別）

### 6.6 ロック中 {#sec_auth_login_totp_locked}

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

- HTTP 401

### 6.7 試行回数超過 {#sec_auth_login_totp_locked}

```json
{
  "ok": false,
  "error": "too_many_attempts"
}
```

- HTTP 429

### 6.8 内部エラー {#sec_auth_login_totp_internal_error}

```json
{
  "ok": false,
  "error": "internal_error"
}
```

- HTTP 500

---

## 7. 処理仕様

### 7.1 challenge 検証 {#sec_auth_login_totp_challenge_validation}

- `prisma.loginChallenge.findUnique({ where: { id: String(challengeId) } })` で検索する
- 存在しない場合は 404
- `used=true` の場合は 404
- `expiresAt <= now()` の場合は 404
- `challenge.userId` に対応するユーザーが存在しない場合は 404

### 7.2 ロック・試行制限 {#sec_auth_login_totp_locked}

- 既存 `User.lockUntil > now()` は401 `unauthorized` とする
- 専用 `MfaLoginAttempt` は `User.id` ごとに永続化し、連続5回の失敗で15分ロックする。ロック中は429 `too_many_attempts`
- 期限到達後の次の失敗は1回目とし、成功時は失敗回数と専用ロックをクリアする
- 専用ロック中はパスワードログインも拒否する。初期設定・無効化APIには専用ロックを自動適用しない
- 失敗計上は並行試行でも加算漏れのない原子的DB更新とする

### 7.3 TOTP code 検証 {#sec_auth_login_totp_success}

- `code` は全角数字を半角数字へ変換する
- 正規化後に6桁の数字と完全一致する場合のみ検証する（文字削除・先頭6桁への切り詰めは行わない）
- 6桁数字の場合のみ `decryptStr(user.totpSecretEnc)` と `authenticator.check()` を使って検証する

### 7.4 recoveryCode 検証 {#sec_auth_login_totp_success}

- `recoveryCode` が文字列の場合のみ検証する
- SHA-256 hex と `user.recoveryCodes` を照合する
- 一致した recoveryCode は使用済みとして配列から削除する

### 7.5 成功時更新 {#sec_auth_login_totp_success}

- `LoginChallenge.used=true`
- 同一DB transactionでchallengeを消費し、必要に応じてRecovery Codeを消費し、`AuthSession` を作成する
- `User.lastLoginAt` を更新する
- MFAログイン専用の失敗回数とロックをリセットする
- 端末関連付け後に `hk_session` と `hk_device` を設定する。端末関連付け失敗時は新sessionを失効させ、Cookieを発行しない

---

## 8. セキュリティ・設計上の注意 {#sec_auth_login_totp_security}

- challengeId は 1 回限り有効
- recoveryCode は 1 回使用で失効
- challenge 不正の詳細をクライアントへ返さない
- 旧 `hk_token` と `X-Token-Expires-At` は使用しない
- TOTP secret は `decryptStr()` により検証時のみ復号する

---

## 9. 現行実装との差分と移行ゲート

- 現行実装はMFAログイン専用の試行回数テーブルをまだ使用していない。専用ロック（5回・15分）は未実装。
- 現行実装は `User.lockUntil` を401 `unauthorized` として扱い、500は `internal_error` を返す。
- 旧VitestはSyncTokenのモックを含み、現行 `AuthSession` と端末Cookieの検証へ更新が必要。
- `MfaLoginAttempt` の追加migrationは未作成。既存DBのバックアップ・未適用migration確認を経て導入する。
- テスト仕様: [ログイン2段階認証テスト仕様](../../../05_テストケース集/01_ユーザー認証API/api_auth_login_totp_testcases.md)。
- 設計根拠: `LLM_WORKSPACE/Worklog/mfa-login-attempt-model-20261013.md`。

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）
