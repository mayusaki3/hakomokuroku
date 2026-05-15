<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-111000Z-AUTRR
lang: ja-JP
canonical_title: リカバリコード再発行（POST /api/auth/totp/recovery/reissue）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > リカバリコード再発行（POST /api/auth/totp/recovery/reissue）

# リカバリコード再発行（POST /api/auth/totp/recovery/reissue）

本書は、リカバリコード再発行 API（POST /api/auth/totp/recovery/reissue）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/totp/recovery/reissue/route.ts）および Vitest（apps/web/tests/api.auth.totp.recovery.reissue.spec.ts）を正とする。

---

## 1. 概要

TOTP を有効化済みのログインユーザーに対して、リカバリコードを再発行する API。

- 要ログイン
- `Content-Type: application/json` 必須
- `code` は6桁数字必須
- TOTP 有効ユーザーのみ実行可能
- 成功時は新しいリカバリコードを10件返す
- DB にはリカバリコードを平文保存せず、SHA-256 hex ハッシュを保存する
- 再発行により旧リカバリコードは全失効する

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_totp_recovery_reissue_content_type | Content-Type 検証 | application/json 以外または未指定を 400 invalid_request にする |
| sec_auth_totp_recovery_reissue_auth | 認証 | requireUserId 失敗を 401 unauthorized にする |
| sec_auth_totp_recovery_reissue_json_parse | JSON parse | JSON parse 失敗を 400 invalid_request にする |
| sec_auth_totp_recovery_reissue_code_validation | code 検証 | code 未指定/空/形式不正を 400 invalid_request にする |
| sec_auth_totp_recovery_reissue_user_lookup | ユーザー取得 | user 不存在を 404 not_found にする |
| sec_auth_totp_recovery_reissue_enabled | TOTP 有効状態 | totpEnabled=false または secret 無しを 409 conflict にする |
| sec_auth_totp_recovery_reissue_verify | TOTP 検証 | code 検証失敗を 400 auth_failed にする |
| sec_auth_totp_recovery_reissue_generate | コード生成 | 平文 recoveryCodes を10件生成する |
| sec_auth_totp_recovery_reissue_hash_store | ハッシュ保存 | recoveryCodes を sha256hex で保存する |
| sec_auth_totp_recovery_reissue_replace | 旧コード失効 | DB の recoveryCodes を置換する |
| sec_auth_totp_recovery_reissue_success | 成功応答 | 200 + ok:true + recoveryCodes を返す |
| sec_auth_totp_recovery_reissue_internal_error | 内部エラー | DB 更新例外などを 500 internal_error にする |
| sec_auth_totp_recovery_reissue_security | セキュリティ | 平文返却は1回限り、検証失敗理由を秘匿する |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/totp/recovery/reissue |

---

## 4. リクエスト

### 4.1 ヘッダー {#sec_auth_totp_recovery_reissue_content_type}

```txt
Content-Type: application/json
```

- `application/json` に一致しない場合は 400
- `headers.get('content-type')` が null の場合も 400

### 4.2 認証 {#sec_auth_totp_recovery_reissue_auth}

- `requireUserId()` によりログインユーザーIDを取得する
- 例外発生時は 401 を返す

### 4.3 Body(JSON) {#sec_auth_totp_recovery_reissue_code_validation}

```json
{
  "code": "123456"
}
```

| 項目 | 必須 | 条件 |
|---|---:|---|
| code | 必須 | trim 後、数字6桁 |

- code 未指定、空文字、空白のみは 400
- 6桁数字以外は 400

---

## 5. レスポンス

### 5.1 正常 {#sec_auth_totp_recovery_reissue_success}

```json
{
  "ok": true,
  "recoveryCodes": [
    "ABCD-1234"
  ]
}
```

- HTTP 200
- `recoveryCodes` は10件
- 各コードは `XXXX-XXXX` 形式

### 5.2 invalid_request

```json
{
  "ok": false,
  "error": "invalid_request"
}
```

- HTTP 400
- Content-Type 不正
- JSON parse 不正
- code 未指定/空/形式不正

### 5.3 unauthorized

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

- HTTP 401

### 5.4 not_found {#sec_auth_totp_recovery_reissue_user_lookup}

```json
{
  "ok": false,
  "error": "not_found"
}
```

- HTTP 404
- ログインユーザーIDに対応する User が存在しない場合

### 5.5 conflict {#sec_auth_totp_recovery_reissue_enabled}

```json
{
  "ok": false,
  "error": "conflict"
}
```

- HTTP 409
- `totpEnabled=false`
- `totpSecretEnc` が無い

### 5.6 auth_failed {#sec_auth_totp_recovery_reissue_verify}

```json
{
  "ok": false,
  "error": "auth_failed"
}
```

- HTTP 400
- TOTP 検証失敗
- DB 更新は行わない

### 5.7 internal_error {#sec_auth_totp_recovery_reissue_internal_error}

```json
{
  "ok": false,
  "error": "internal_error"
}
```

- HTTP 500

---

## 6. 処理仕様

### 6.1 ユーザー取得 {#sec_auth_totp_recovery_reissue_user_lookup}

```ts
await prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    totpEnabled: true,
    totpSecretEnc: true,
    recoveryCodes: true,
    totpFailCount: true,
    lockUntil: true,
  },
});
```

### 6.2 TOTP 検証 {#sec_auth_totp_recovery_reissue_verify}

```ts
await verifyTotpCode(user, code);
```

- false の場合は 400 auth_failed
- 検証失敗理由は返さない

### 6.3 リカバリコード生成 {#sec_auth_totp_recovery_reissue_generate}

- 10件生成する
- 平文形式は `XXXX-XXXX`
- 使用文字は英大文字・数字

### 6.4 ハッシュ保存 {#sec_auth_totp_recovery_reissue_hash_store}

```ts
const hashedCodes = plainCodes.map((c) => sha256hex(c));
```

- DB 保存値は 64桁 lowercase hex
- 平文は DB に保存しない

### 6.5 旧コード失効 {#sec_auth_totp_recovery_reissue_replace}

```ts
await prisma.user.update({
  where: { id: user.id },
  data: { recoveryCodes: hashedCodes },
});
```

- 既存 `recoveryCodes` は置換される
- 旧コードは以後無効になる

---

## 7. セキュリティ・設計上の注意 {#sec_auth_totp_recovery_reissue_security}

- リカバリコードの平文返却はこのレスポンス1回限り
- 再発行には TOTP による本人確認を必須とする
- 認証失敗理由の詳細は返さない
- DB には平文コードを保存しない
- 再発行により旧コードを全失効する

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > リカバリコード再発行（POST /api/auth/totp/recovery/reissue）
