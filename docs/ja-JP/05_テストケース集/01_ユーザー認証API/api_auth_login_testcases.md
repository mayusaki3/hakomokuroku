<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-085500Z-AULT
lang: ja-JP
canonical_title: ログインテスト仕様（POST /api/auth/login）
document_type: testspec
canonical_document: true
-->

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログインテスト仕様（POST /api/auth/login）

# ログインテスト仕様（POST /api/auth/login）

本書は、ログイン API（POST /api/auth/login）のテスト仕様を定義する。  
本書の期待結果をテスト実装の目標契約とする。既存Vitestには旧Cookie・モックが残っているため更新が必要。

---

## 1. Traceability Matrix

| testcase_id | 対応 sec_id |
|---|---|
| API_AUTH_LOGIN-TC-01 | sec_auth_login_success_basic |
| API_AUTH_LOGIN-TC-02 | sec_auth_login_invalid_request, sec_auth_login_request_body |
| API_AUTH_LOGIN-TC-03 | sec_auth_login_invalid_request |
| API_AUTH_LOGIN-TC-04 | sec_auth_login_user_lookup, sec_auth_login_auth_failed, sec_auth_login_security |
| API_AUTH_LOGIN-TC-05 | sec_auth_login_auth_failed, sec_auth_login_security |
| API_AUTH_LOGIN-TC-07 | sec_auth_login_locked |
| API_AUTH_LOGIN-TC-06 | sec_auth_login_mfa_challenge |
| API_AUTH_LOGIN-TC-08 | sec_auth_login_locked |
| API_AUTH_LOGIN-TC-09 | sec_auth_login_success_basic, sec_auth_login_security |
| API_AUTH_LOGIN-TC-10 | sec_auth_login_mfa_challenge, sec_auth_login_security |

---

## 2. テストケース

### API_AUTH_LOGIN-TC-01 正常：ログイン成功

#### 対応 sec_id

- sec_auth_login_success_basic

#### 条件

- 正しい `userId`
- 正しい `password`

#### 期待結果

- HTTP 200
- `ok:true`
- `mfaRequired:false`
- `Set-Cookie` に `hk_session` と `hk_device` を含む
- AuthSession作成、端末紐付けが成功している

---

### API_AUTH_LOGIN-TC-02 異常：必須項目不足

#### 対応 sec_id

- sec_auth_login_invalid_request
- sec_auth_login_request_body

#### 条件

- `userId` 未指定
- `password` 未指定
- 空文字
- `null`

#### 期待結果

- HTTP 400
- `ok:false`

---

### API_AUTH_LOGIN-TC-03 異常：body 不正

#### 対応 sec_id

- sec_auth_login_invalid_request

#### 条件

- JSON body が `null`
- object 以外
- JSON parse 失敗

#### 期待結果

- HTTP 400
- `error=invalid_request`

---

### API_AUTH_LOGIN-TC-04 異常：ユーザー不明

#### 対応 sec_id

- sec_auth_login_user_lookup
- sec_auth_login_auth_failed
- sec_auth_login_security

#### 条件

- 存在しない `userId`

#### 期待結果

- HTTP 401
- `error=unauthorized`
- 未登録ユーザーであることを特定できる情報を返さない

---

### API_AUTH_LOGIN-TC-05 異常：パスワード不一致

#### 対応 sec_id

- sec_auth_login_auth_failed
- sec_auth_login_security

#### 条件

- 存在する `userId`
- 誤った `password`

#### 期待結果

- HTTP 401
- `error=unauthorized`
- パスワード不一致であることを特定できる情報を返さない

---

### API_AUTH_LOGIN-TC-07 異常：lockUntil が未来

#### 対応 sec_id

- sec_auth_login_locked

#### 条件

- `lockUntil > now()`

#### 期待結果

- HTTP 401
- `error=unauthorized`

---

### API_AUTH_LOGIN-TC-06 正常：TOTP有効ユーザー

#### 対応 sec_id

- sec_auth_login_mfa_challenge

#### 条件

- TOTP有効、正しいuserId/password

#### 期待結果

- HTTP 200、`ok:true`、`mfaRequired:true`、`challengeId` を返す
- 期限5分のLoginChallengeを作成
- AuthSessionを作成せず、`hk_session` と `hk_device` を発行しない

---

### API_AUTH_LOGIN-TC-08 異常：MFA専用ロック中（実装予定）

#### 対応 sec_id

- sec_auth_login_locked

#### 条件

- `MfaLoginAttempt.lockedUntil > now()`

#### 期待結果

- HTTP 429、`too_many_attempts`
- LoginChallenge・AuthSession・Cookieを発行しない
- 既存 `User.lockUntil` は変更しない

---

### API_AUTH_LOGIN-TC-09 異常：端末紐付け失敗

#### 対応 sec_id

- sec_auth_login_success_basic
- sec_auth_login_security

#### 条件

- TOTP無効、パスワード一致、`attachLoginDevice` が失敗

#### 期待結果

- HTTP 500 `internal_error`
- 作成した新AuthSessionを失効
- Cookieを発行しない

---

### API_AUTH_LOGIN-TC-10 セキュリティ：MFA前の既存session

#### 対応 sec_id

- sec_auth_login_mfa_challenge
- sec_auth_login_security

#### 条件

- 有効な既存`hk_session`を持つブラウザで、TOTP有効ユーザーのパスワード認証が成功

#### 期待結果

- MFA完了前は新AuthSessionとCookieを発行しない
- 既存sessionはこの時点では失効させない

---

## 3. ローカル検証手順

```powershell
pnpm -C apps/web exec vitest --run
```

テスト実行結果を記録すること。過去の固定件数を合格条件にしない。

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログインテスト仕様（POST /api/auth/login）
