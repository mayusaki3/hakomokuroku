<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-085000Z-AULG
lang: ja-JP
canonical_title: ログイン（POST /api/auth/login）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン（POST /api/auth/login）

# ログイン（POST /api/auth/login）

本書は、ログイン API（POST /api/auth/login）の正式な仕様を定義する。  
本書は現行セッション方式とMFAログイン試行制限の目標契約を定義する。MFA専用ロックは未実装であり、既存Vitestには旧方式の期待値が残る。

---

## 1. 概要

ログインフォームから送信された `userId` と `password` を検証し、正しい場合に、TOTP無効ならログインCookieを発行し、TOTP有効なら一時challengeのみを返すAPI。

- `Content-Type: application/json` のみ受け付ける
- JSON body は object でなければならない
- `userId` はtrim後に空文字でないこと。`password` は空文字でない文字列であること（空白だけのパスワードも現行実装では入力形式エラーとしない）
- ユーザー不明、パスワード不一致、ロック中はいずれも 401 とする
- TOTP無効時は `hk_session` と `hk_device` を発行する。TOTP有効時は `LoginChallenge` を作成し、Cookieを発行しない

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_login_invalid_request | 不正リクエスト | Content-Type / JSON / body / 必須項目不正を 400 にする |
| sec_auth_login_request_body | リクエスト本文 | `userId` と `password` を受け取る |
| sec_auth_login_user_lookup | ユーザー検索 | `prisma.user.findUnique({ where: { userId } })` でユーザーを検索する |
| sec_auth_login_auth_failed | 認証失敗 | userId 不明 / password 不一致を 401 にする |
| sec_auth_login_locked | ロック中 | 既存User.lockUntilが未来なら401。MFA専用ロック中もログイン拒否（新規契約） |
| sec_auth_login_success_basic | パスワードのみの成功 | 200 + ok:true + mfaRequired:false + session/device Cookie |
| sec_auth_login_mfa_challenge | MFAチャレンジ | TOTP有効なら200 + mfaRequired:true + challengeId、Cookieなし |
| sec_auth_login_security | セキュリティ | 認証失敗理由を詳細化しない |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/login |

---

## 4. リクエスト

### 4.1 Body(JSON) {#sec_auth_login_request_body}

```json
{
  "userId": "string",
  "password": "string"
}
```

### 4.2 バリデーション {#sec_auth_login_invalid_request}

| 項目 | 条件 | 不正時 |
|---|---|---|
| Content-Type | `application/json` を含むこと | 400 invalid_request |
| JSON | `req.json()` が成功すること | 400 invalid_request |
| body | `null` ではなく object であること | 400 invalid_request |
| userId | 必須・空白のみではない文字列 | 400 invalid_request |
| password | 必須・空白のみではない文字列 | 400 invalid_request |

---

## 5. レスポンス

### 5.1 パスワードのみのログイン成功 {#sec_auth_login_success_basic}

```json
{
  "ok": true,
  "mfaRequired": false
}
```

- HTTP 200
- `Set-Cookie` に `hk_session` と `hk_device` を含める。session tokenはランダム32 bytesのbase64url、DBにはSHA-256 digestのみ保存する
- AuthSessionの有効期限は発行から固定30日。既存ブラウザsessionは新session確立後に失効する

### 5.1.1 MFAチャレンジ {#sec_auth_login_mfa_challenge}

```json
{
  "ok": true,
  "mfaRequired": true,
  "challengeId": "challenge-id"
}
```

- HTTP 200。TOTP有効ユーザーの場合は有効期限5分のLoginChallengeを発行する
- この段階ではAuthSessionも`hk_session`/`hk_device` Cookieも発行しない
- `POST /api/auth/login/totp` の成功後にセッションを確立する

### 5.2 不正リクエスト {#sec_auth_login_invalid_request}

```json
{
  "ok": false,
  "error": "invalid_request"
}
```

- HTTP 400

### 5.3 認証失敗 {#sec_auth_login_auth_failed}

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

- HTTP 401
- ユーザー不明とパスワード不一致をレスポンス上で区別しない

### 5.4 ロック中 {#sec_auth_login_locked}

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

- HTTP 401
- 既存 `User.lockUntil` が未来の場合に返す。MFA専用ロック時のHTTP契約は下記に記載
- ロック理由をレスポンス上で詳細化しない

---

## 6. 処理仕様

### 6.1 ユーザー検索 {#sec_auth_login_user_lookup}

```ts
await prisma.user.findUnique({
  where: { userId },
});
```

- `userId` は trim 後の値を使用する
- ユーザーが存在しない場合は 401 を返す

### 6.2 ロック判定 {#sec_auth_login_locked}

- 既存 `User.lockUntil > now()` は401 `unauthorized`。この列の既存用途は変更しない
- MFAログイン専用の `MfaLoginAttempt.lockedUntil > now()` は429 `too_many_attempts` とし、TOTPの前段であるパスワードログインも拒否する（未実装の目標契約）
- MFA専用ロックが期限切れなら再試行を許可し、次の失敗は1回目から計上する。ロック期限のDB判定は競合安全に実施する

### 6.3 パスワード検証 {#sec_auth_login_auth_failed}

- `passwordHash` が存在しない場合は 401 を返す
- `verifyPassword(user.passwordHash, password)` が false の場合は401を返す。パスワード失敗をMFA専用カウンターには計上しない

### 6.4 Cookie 発行 {#sec_auth_login_success_basic}

- 成功時のみ `Set-Cookie` を返す
- TOTP無効時は `AuthSession` を作成して端末へ紐付け、`hk_session` と `hk_device` を発行する。端末紐付け失敗時は新sessionを失効させる
- TOTP有効時はCookie発行を行わない

---

### 6.5 MFA専用ロック応答 {#sec_auth_login_locked}

```json
{
  "ok": false,
  "error": "too_many_attempts"
}
```

- HTTP 429（実装予定）。既存の `User.lockUntil` による401とは別の条件とする
- ロック状態の確認で新しいchallengeやsessionを作成しない
- 専用状態はUserごとの `MfaLoginAttempt` で管理する

---

## 7. セキュリティ注意点 {#sec_auth_login_security}

- レスポンスにパスワードを含めてはならない
- 認証失敗理由を詳細化してはならない
- ユーザー不明とパスワード不一致を区別できる情報を返してはならない
- ロック中も詳細なロック理由を返してはならない

---

## 8. 実装差分・テストゲート

- 現行実装は `hk_session`/`hk_device` とMFAチャレンジを使用しているが、`MfaLoginAttempt` と専用429ロックは未実装。
- 専用モデルのmigrationを安全に作成・検証し、テスト仕様にMFAチャレンジとロックを追加してから実装する。
- 既存 `apps/web/tests/api.auth.login.spec.ts` の旧 `sid` 期待値と旧モックを更新する。
- MFA失敗5回によるロック中も、既存 `User.lockUntil` の振る舞いを維持する。

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン（POST /api/auth/login）
