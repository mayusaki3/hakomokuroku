<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-094000Z-AUTD
lang: ja-JP
canonical_title: TOTP 無効化（POST /api/auth/totp/disable）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 無効化（POST /api/auth/totp/disable）

# TOTP 無効化（POST /api/auth/totp/disable）

本書は、TOTP 無効化 API（POST /api/auth/totp/disable）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/totp/disable/route.ts）および Vitest（apps/web/tests/api.auth.totp.disable.spec.ts）を正とする。

---

## 1. 概要

有効化済み TOTP を解除する API。

- 要ログイン
- `Content-Type: application/json` 必須
- TOTP code または recoveryCode のいずれかが必須
- 成功時は 204 No Content
- TOTP 未有効は 409 conflict
- ロック中は 429 too_many_requests
- DB 更新例外は 500 を返す

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_totp_disable_auth | 認証 | requireUserId でログインユーザーを取得する |
| sec_auth_totp_disable_content_type | Content-Type | application/json 以外を 400 にする |
| sec_auth_totp_disable_json_parse | JSON parse | JSON parse 失敗を 400 にする |
| sec_auth_totp_disable_input | 入力検証 | code / recoveryCode の必須・形式を検証する |
| sec_auth_totp_disable_user_lookup | ユーザー取得 | userId からユーザーを取得する |
| sec_auth_totp_disable_enabled | 有効状態 | TOTP 未有効を 409 にする |
| sec_auth_totp_disable_locked | ロック | lockUntil が未来なら 429 にする |
| sec_auth_totp_disable_verify | 検証 | code / recoveryCode を検証する |
| sec_auth_totp_disable_success | 無効化成功 | TOTP 関連情報を削除して 204 を返す |
| sec_auth_totp_disable_internal_error | 内部エラー | DB 更新例外を 500 にする |
| sec_auth_totp_disable_security | セキュリティ | 失敗理由の詳細化を避ける |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/totp/disable |

---

## 4. リクエスト

### 4.1 認証 {#sec_auth_totp_disable_auth}

- `requireUserId()` によりログインユーザーIDを取得する
- `status=401` または `message='UNAUTHORIZED'` の例外は 401 に変換する
- それ以外の例外は throw する

### 4.2 ヘッダー {#sec_auth_totp_disable_content_type}

```txt
Content-Type: application/json
```

### 4.3 Body(JSON) {#sec_auth_totp_disable_input}

```json
{
  "code": "123456",
  "recoveryCode": "ABCD-1234"
}
```

| 項目 | 条件 | 不正時 |
|---|---|---|
| code | 任意。指定時は数字6桁 | 400 bad_request |
| recoveryCode | 任意。指定時は空でない文字列 | 400 bad_request |

- `code` / `recoveryCode` の両方が未指定の場合は 400
- 両方指定された場合、現実装は `code` を優先する

---

## 5. レスポンス

### 5.1 正常 {#sec_auth_totp_disable_success}

- HTTP 204
- Body なし

### 5.2 不正リクエスト {#sec_auth_totp_disable_content_type}

```json
{
  "ok": false,
  "error": "bad_request"
}
```

- HTTP 400
- Content-Type 不正
- JSON parse 失敗
- body が null
- code / recoveryCode 両方未指定
- code / recoveryCode 形式不正

### 5.3 未ログイン {#sec_auth_totp_disable_auth}

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

- HTTP 401

### 5.4 TOTP 未有効 {#sec_auth_totp_disable_enabled}

```json
{
  "ok": false,
  "error": "conflict"
}
```

- HTTP 409

### 5.5 検証失敗 {#sec_auth_totp_disable_verify}

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

- HTTP 401

### 5.6 ロック中 {#sec_auth_totp_disable_locked}

```json
{
  "ok": false,
  "error": "too_many_requests"
}
```

- HTTP 429

### 5.7 内部エラー {#sec_auth_totp_disable_internal_error}

- HTTP 500
- 現実装は body なし

---

## 6. 処理仕様

### 6.1 認証 {#sec_auth_totp_disable_auth}

```ts
userId = await requireUserId();
```

- 401 相当のみ `unauthorized` に変換する
- それ以外は呼び出し元へ throw する

### 6.2 Content-Type / JSON {#sec_auth_totp_disable_json_parse}

- `headers.get('content-type') ?? ''` が `application/json` を含まない場合は 400
- `req.json()` 失敗時は 400
- body が null の場合も、code / recoveryCode 未指定として 400

### 6.3 入力検証 {#sec_auth_totp_disable_input}

- `code` は string かつ 1 文字以上の場合に指定ありと判定する
- 指定された `code` が `/^\d{6}$/` に一致しない場合は 400
- `recoveryCode` は string かつ trim 後 1 文字以上の場合に指定ありと判定する
- どちらも指定されていない場合は 400

### 6.4 ユーザー取得と状態判定 {#sec_auth_totp_disable_user_lookup}

```ts
const user = await prisma.user.findUnique({ where: { id: userId } });
```

- ユーザー不在、または `totpEnabled` が true でない場合は 409

### 6.5 ロック判定 {#sec_auth_totp_disable_locked}

- `user.lockUntil > now()` の場合は 429

### 6.6 code / recoveryCode 検証 {#sec_auth_totp_disable_verify}

- `code` 指定時は `verifyTotpCode(user, code)` を使用する
- `code` 未指定時は `verifyRecoveryCode(user, recoveryCode.trim())` を使用する
- false の場合は 401

### 6.7 無効化 {#sec_auth_totp_disable_success}

成功時は以下を更新する。

```ts
{
  totpEnabled: false,
  totpSecretEnc: null,
  recoveryCodes: null,
  totpFailCount: 0
}
```

---

## 7. セキュリティ・設計上の注意 {#sec_auth_totp_disable_security}

- 無効化後は再度 `/api/auth/totp/setup` から設定する
- recoveryCode の検証は既存ユーティリティに委譲する
- 認証失敗時は詳細理由を返さない
- 401 以外の認証例外は route 内で握りつぶさない

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 無効化（POST /api/auth/totp/disable）
