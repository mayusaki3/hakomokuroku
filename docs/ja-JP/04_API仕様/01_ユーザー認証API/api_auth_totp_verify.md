<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-092000Z-AUTV
lang: ja-JP
canonical_title: TOTP 有効化確認（POST /api/auth/totp/verify）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 有効化確認（POST /api/auth/totp/verify）

# TOTP 有効化確認（POST /api/auth/totp/verify）

本書は、TOTP 有効化確認 API（POST /api/auth/totp/verify）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/totp/verify/route.ts）および Vitest（apps/web/tests/api.auth.totp.verify.spec.ts）を正とする。

---

## 1. 概要

`/api/auth/totp/setup` で保存した pending secret を用いて、ユーザーが入力した TOTP code を検証し、正しければ TOTP を有効化する API。

- 要ログイン
- `Content-Type: application/json` 必須
- `code` は 6 桁数字のみ許可
- 成功時はリカバリコードを 10 件生成して返す
- リカバリコードの平文返却はこのレスポンスのみ
- 現実装では code 不一致は 400 + `auth_failed`

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_totp_verify_content_type | Content-Type | application/json 以外を 400 にする |
| sec_auth_totp_verify_json_parse | JSON parse | JSON parse 失敗を 400 にする |
| sec_auth_totp_verify_code_validation | code 検証 | code 未指定・空・形式不正を 400 にする |
| sec_auth_totp_verify_auth | 認証 | 未ログインを 401 にする |
| sec_auth_totp_verify_error_mapping | 例外変換 | getCurrentUser 例外を応答へマッピングする |
| sec_auth_totp_verify_user_lookup | ユーザー取得 | DB ユーザー不在を 404 にする |
| sec_auth_totp_verify_conflict | 状態競合 | 既に有効 / setup 未実行を 409 にする |
| sec_auth_totp_verify_code_mismatch | code 不一致 | 失敗回数を加算し 400 auth_failed を返す |
| sec_auth_totp_verify_success | 有効化成功 | TOTP 有効化、pending 昇格、recoveryCodes 生成を行う |
| sec_auth_totp_verify_internal_error | 内部エラー | DB 例外等を 500 internal_error にする |
| sec_auth_totp_verify_security | セキュリティ | recoveryCodes は平文返却1回のみとする |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/totp/verify |

---

## 4. リクエスト

### 4.1 ヘッダー {#sec_auth_totp_verify_content_type}

```txt
Content-Type: application/json
```

### 4.2 Body(JSON) {#sec_auth_totp_verify_code_validation}

```json
{
  "code": "123456"
}
```

- `code` は必須
- `code` は string
- `code` は 6 桁数字

---

## 5. レスポンス

### 5.1 正常 {#sec_auth_totp_verify_success}

```json
{
  "ok": true,
  "recoveryCodes": [
    "ABCD-1234"
  ]
}
```

- HTTP 200
- `recoveryCodes` は 10 件

### 5.2 不正リクエスト {#sec_auth_totp_verify_content_type}

```json
{
  "ok": false,
  "error": "invalid_request"
}
```

- HTTP 400
- Content-Type 不正、JSON parse 失敗、code 未指定・空・形式不正を含む

### 5.3 未ログイン {#sec_auth_totp_verify_auth}

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

- HTTP 401

### 5.4 ユーザー不明 {#sec_auth_totp_verify_user_lookup}

```json
{
  "ok": false,
  "error": "not_found"
}
```

- HTTP 404

### 5.5 競合 {#sec_auth_totp_verify_conflict}

```json
{
  "ok": false,
  "error": "conflict"
}
```

- HTTP 409
- 既に TOTP 有効
- setup 未実行

### 5.6 code 不一致 {#sec_auth_totp_verify_code_mismatch}

```json
{
  "ok": false,
  "error": "auth_failed"
}
```

- HTTP 400
- `totpFailCount` を加算する

### 5.7 内部エラー {#sec_auth_totp_verify_internal_error}

```json
{
  "ok": false,
  "error": "internal_error"
}
```

- HTTP 500

---

## 6. 処理仕様

### 6.1 Content-Type / JSON {#sec_auth_totp_verify_json_parse}

- `headers.get('content-type') ?? ''` により null を空文字として扱う
- `application/json` を含まない場合は 400
- `req.json()` が例外を投げた場合は 400

### 6.2 認証 {#sec_auth_totp_verify_auth}

- `getCurrentUser(req)` によりユーザーを取得する
- `null` / `undefined` / `id` なしは 401

### 6.3 例外変換 {#sec_auth_totp_verify_error_mapping}

| 例外メッセージ | 応答 |
|---|---|
| UNAUTHORIZED | 401 unauthorized |
| NOT_FOUND | 404 not_found |
| CONFLICT | 409 conflict |
| AUTH_FAILED | 400 auth_failed |
| その他 | 500 internal_error |

### 6.4 ユーザー取得 {#sec_auth_totp_verify_user_lookup}

- `prisma.user.findUnique()` でユーザーを取得する
- select 対象は TOTP 関連フィールドに限定する

### 6.5 競合判定 {#sec_auth_totp_verify_conflict}

- `totpEnabled=true` の場合は 409
- `totpPendingSecretEnc` が存在しない場合は 409

### 6.6 code 検証 {#sec_auth_totp_verify_code_mismatch}

- `verifyTotpPendingCode(user, code)` を使用する
- false の場合、`totpFailCount` を +1 して 400 + `auth_failed` を返す
- `totpFailCount=null` は 0 として扱う

### 6.7 有効化成功 {#sec_auth_totp_verify_success}

成功時は以下を更新する。

```ts
{
  totpEnabled: true,
  totpSecretEnc: user.totpPendingSecretEnc,
  totpPendingSecretEnc: null,
  totpFailCount: 0,
  totpRecoveryCodes: hashed,
}
```

- `generateRecoveryCodes(10)` で平文リカバリコードを生成する
- `hashRecoveryCode()` でハッシュ化して DB に保存する
- 平文リカバリコードをレスポンスで返す

---

## 7. セキュリティ・設計上の注意 {#sec_auth_totp_verify_security}

- リカバリコードの平文返却は成功レスポンスの 1 回のみ
- DB にはハッシュ化した recoveryCodes のみ保存する
- 有効化済みの場合は再有効化しない
- setup 未実行では有効化しない

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 有効化確認（POST /api/auth/totp/verify）
