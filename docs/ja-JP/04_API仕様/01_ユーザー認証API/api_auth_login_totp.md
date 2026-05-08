[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）

# ログイン2段階認証（POST /api/auth/login/totp）

## 1. 概要

`/api/auth/login` による ID/パスワード認証後、TOTP が有効なユーザーに対して 2 段階目の認証を行い、ログインを完了させる API。

- 前段の `/api/auth/login` により LoginChallenge（challengeId）が発行済みであることを前提とする
- 本 API は challengeId 単位で認証を完了させる
- TOTP code または recoveryCode を検証する
- 認証成功時のみ LoginChallenge を使用済みに更新し、ログイン用 token / cookie を発行する

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_login_totp_request | リクエスト | challengeId と code / recoveryCode を受け取る |
| sec_auth_login_totp_invalid_request | 不正リクエスト | Content-Type / body / 必須項目不正を 400 にする |
| sec_auth_login_totp_challenge_validation | challenge 検証 | challenge 不存在 / 期限切れ / 使用済みを拒否する |
| sec_auth_login_totp_success | 認証成功 | 正しい TOTP / recoveryCode でログインを完了する |
| sec_auth_login_totp_invalid_code | 認証コード不一致 | code / recoveryCode 不一致を拒否する |
| sec_auth_login_totp_locked | ロック中 | lockUntil が未来なら拒否する |
| sec_auth_login_totp_internal_error | 内部エラー | 予期しない例外を 500 にする |
| sec_auth_login_totp_security | セキュリティ | challengeId / recoveryCode を安全に扱う |

---

## 3. エンドポイント

- Method: POST
- Path: `/api/auth/login/totp`

---

## 4. 認可・前提条件 {#sec_auth_login_totp_challenge_validation}

- Cookie 認証は不要
- challengeId（LoginChallenge.id）が有効であること
  - 未失効
  - 未使用
  - 有効期限内

上記を満たさない場合は認証不可。

---

## 5. リクエスト

### 5.1 ヘッダー {#sec_auth_login_totp_invalid_request}

- Content-Type: `application/json`

---

### 5.2 ボディ {#sec_auth_login_totp_request}

```json
{
  "challengeId": "xxxxxxxx",
  "code": "123456",
  "recoveryCode": "ABCD1234"
}
```

| 項目 | 条件 |
|---|---|
| challengeId | 必須 |
| code | 任意 |
| recoveryCode | 任意 |

- `code` または `recoveryCode` のいずれか 1 つ以上が必須
- code は 6 桁数字を想定

---

## 6. 処理概要

1. Content-Type を検証
2. challengeId の存在・未使用・未失効を検証
3. challengeId に紐づくユーザーを取得
4. ユーザーの TOTP 有効状態を確認
5. lockUntil を確認
6. TOTP code または recoveryCode を検証
7. 成功時のみ LoginChallenge を使用済みに更新
8. token / cookie を発行

---

## 7. レスポンス

### 7.1 正常（200 OK） {#sec_auth_login_totp_success}

```json
{
  "ok": true,
  "token": "xxxxxxxx",
  "expiresAt": "2026-03-01T00:00:00.000Z"
}
```

- token
  - ログイン後に使用する token
- expiresAt
  - token 有効期限（ISO-8601）
- Set-Cookie
  - ログイン用 Cookie を設定する

---

### 7.2 異常系

| sec_id | 状況 | ステータス | error |
|---|---|---:|---|
| sec_auth_login_totp_invalid_request | Content-Type 不正 | 400 | bad_request |
| sec_auth_login_totp_invalid_request | challengeId 未指定 | 400 | bad_request |
| sec_auth_login_totp_invalid_request | code / recoveryCode 未指定 | 400 | bad_request |
| sec_auth_login_totp_invalid_request | 入力形式不正 | 400 | bad_request |
| sec_auth_login_totp_challenge_validation | challenge 期限切れ / 使用済み | 400 | expired |
| sec_auth_login_totp_challenge_validation | challenge 不存在 | 404 | not_found |
| sec_auth_login_totp_invalid_code | 認証コード不一致 | 400 / 401 / 422 | invalid |
| sec_auth_login_totp_locked | lockUntil が未来 | 401 / 429 | too_many_attempts |
| sec_auth_login_totp_internal_error | 予期しない例外 | 500 | server_error |

---

## 8. DB 更新仕様

### 8.1 認証成功時 {#sec_auth_login_totp_success}

- LoginChallenge.used = true
- SyncToken 発行
- User.lastLoginAt 更新
- recoveryCode 使用時:
  - 使用済みコードを削除

### 8.2 認証失敗時 {#sec_auth_login_totp_invalid_code}

- 失敗回数を内部的に記録する
- 必要に応じて lockUntil を更新する

---

## 9. セキュリティ・設計上の注意 {#sec_auth_login_totp_security}

- challengeId は 1 回限り有効
- recoveryCode は 1 回使用で失効
- challengeId は推測困難な値とする
- レスポンスは認証失敗理由を最小限に留める
- TOTP / recoveryCode 両方失敗時のみ invalid を返す

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）
