<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-091000Z-AUTS
lang: ja-JP
canonical_title: TOTP 設定開始（POST /api/auth/totp/setup）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 設定開始（POST /api/auth/totp/setup）

# TOTP 設定開始（POST /api/auth/totp/setup）

本書は、TOTP による二要素認証の設定開始 API（POST /api/auth/totp/setup）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/totp/setup/route.ts）および Vitest（apps/web/tests/api.auth.totp.setup.spec.ts）を正とする。

---

## 1. 概要

ログイン中ユーザーに対して、TOTP 設定用のシークレットを新規生成し、認証アプリで読み込むための `otpauth://` URL を返す API。

- 要ログイン
- すでに TOTP が有効なユーザーには設定開始を許可しない
- 成功時は `totpPendingSecretEnc` を保存する
- 平文 TOTP secret は DB に保存しない
- 暗号鍵 `TOTP_SECRET_KEY` が未設定または不正な場合は 500 を返す

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_totp_setup_auth | 認証 | getCurrentUser が null の場合 401 を返す |
| sec_auth_totp_setup_user_lookup | ユーザー取得 | DB ユーザー不在なら 404 を返す |
| sec_auth_totp_setup_conflict | 既に有効 | totpEnabled=true の場合 409 を返す |
| sec_auth_totp_setup_secret_generate | secret 生成 | authenticator.generateSecret を使用する |
| sec_auth_totp_setup_encrypt | secret 暗号化 | TOTP_SECRET_KEY で AES-256-GCM 暗号化する |
| sec_auth_totp_setup_persist | pending 保存 | totpPendingSecretEnc を DB に保存する |
| sec_auth_totp_setup_success | 成功応答 | 200 + ok:true + otpauthUrl を返す |
| sec_auth_totp_setup_internal_error | 内部エラー | DB 例外・鍵不備を 500 internal_error にする |
| sec_auth_totp_setup_security | セキュリティ | 平文 secret を DB/ログ/レスポンスへ保存しない |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/totp/setup |

---

## 4. リクエスト

### 4.1 認証 {#sec_auth_totp_setup_auth}

- `getCurrentUser()` によりログイン中ユーザーを取得する
- 未ログインの場合は 401 を返す

### 4.2 Body

なし。

---

## 5. レスポンス

### 5.1 成功 {#sec_auth_totp_setup_success}

```json
{
  "ok": true,
  "otpauthUrl": "otpauth://totp/..."
}
```

- HTTP 200
- `otpauthUrl` は認証アプリ登録用 URL
- QR コード生成はクライアント側で行う

### 5.2 未ログイン {#sec_auth_totp_setup_auth}

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

- HTTP 401

### 5.3 ユーザー不明 {#sec_auth_totp_setup_user_lookup}

```json
{
  "ok": false,
  "error": "not_found"
}
```

- HTTP 404

### 5.4 既に TOTP 有効 {#sec_auth_totp_setup_conflict}

```json
{
  "ok": false,
  "error": "conflict"
}
```

- HTTP 409

### 5.5 内部エラー {#sec_auth_totp_setup_internal_error}

```json
{
  "ok": false,
  "error": "internal_error"
}
```

- HTTP 500
- DB 例外、`TOTP_SECRET_KEY` 未設定、鍵長不正を含む

---

## 6. 処理仕様

### 6.1 ユーザー取得 {#sec_auth_totp_setup_user_lookup}

```ts
const me = await getCurrentUser();
const user = await prisma.user.findUnique({ where: { id: me.id } });
```

- `me` が null の場合は 401
- `user` が null の場合は 404

### 6.2 競合判定 {#sec_auth_totp_setup_conflict}

- `user.totpEnabled === true` の場合は 409 + `conflict`

### 6.3 secret 生成 {#sec_auth_totp_setup_secret_generate}

- `authenticator.generateSecret()` で TOTP secret を生成する
- `authenticator.options = { window: 1 }` とする

### 6.4 暗号化 {#sec_auth_totp_setup_encrypt}

- `process.env.TOTP_SECRET_KEY` を base64 として読み取る
- 復号後の鍵長は 32 bytes 必須
- `aes-256-gcm` で暗号化する
- 保存形式は `iv(12) + tag(16) + enc` を base64 化した文字列

### 6.5 pending 保存 {#sec_auth_totp_setup_persist}

```ts
await prisma.user.update({
  where: { id: user.id },
  data: { totpPendingSecretEnc: pendingEnc },
});
```

### 6.6 otpauth URL 生成 {#sec_auth_totp_setup_success}

- issuer は `HakoMokuroku`
- label は `user:${user.id}`
- `authenticator.keyuri(label, issuer, secret)` で生成する

---

## 7. セキュリティ・設計上の注意 {#sec_auth_totp_setup_security}

- 本 API は TOTP 有効化前の準備専用
- 実際の有効化は `/api/auth/totp/verify` で行う
- 平文 secret はレスポンス、DB、ログに保存しない
- レスポンスには暗号化済み secret を含めない
- 暗号鍵不備は 500 internal_error とする

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 設定開始（POST /api/auth/totp/setup）
