<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-093000Z-AUTST
lang: ja-JP
canonical_title: TOTP 状態取得（GET /api/auth/totp/status）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 状態取得（GET /api/auth/totp/status）

# TOTP 状態取得（GET /api/auth/totp/status）

本書は、ログイン途中で使用する TOTP 状態取得 API（GET /api/auth/totp/status）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/totp/status/route.ts）および Vitest（apps/web/tests/api.auth.totp.status.spec.ts）を正とする。

---

## 1. 概要

一次ログインで発行された `LoginChallenge.id` を `challengeId` として受け取り、対象ユーザーのリカバリコード残数を返す API。

- Cookie 認証は不要
- `challengeId` は必須
- challenge 不存在 / 使用済み / 期限切れは 404
- `User.recoveryCodes` が配列でない場合は 0 件として扱う
- DB 例外は 500 を返す

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_totp_status_request | リクエスト | challengeId クエリを受け取る |
| sec_auth_totp_status_bad_request | 不正リクエスト | challengeId 未指定を 400 にする |
| sec_auth_totp_status_challenge | challenge 検証 | 不存在 / used=true / 期限切れを 404 にする |
| sec_auth_totp_status_user_lookup | ユーザー取得 | challenge.userId からユーザーを取得する |
| sec_auth_totp_status_recovery_count | 残数算出 | recoveryCodes 配列長を recoveryRemain として返す |
| sec_auth_totp_status_success | 成功応答 | 200 + ok:true + recoveryRemain を返す |
| sec_auth_totp_status_internal_error | 内部エラー | DB 例外を 500 にする |
| sec_auth_totp_status_security | セキュリティ | challenge 不正詳細を返さない |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| GET | /api/auth/totp/status |

---

## 4. リクエスト

### 4.1 Query {#sec_auth_totp_status_request}

```txt
/api/auth/totp/status?challengeId=C1
```

| パラメータ | 必須 | 説明 |
|---|---|---|
| challengeId | 必須 | 一次ログインで発行された LoginChallenge.id |

---

## 5. レスポンス

### 5.1 正常 {#sec_auth_totp_status_success}

```json
{
  "ok": true,
  "recoveryRemain": 3
}
```

- HTTP 200
- `recoveryRemain` は `User.recoveryCodes` の配列長
- `recoveryCodes` が null / 非配列の場合は 0

### 5.2 challengeId 未指定 {#sec_auth_totp_status_bad_request}

```json
{
  "ok": false,
  "error": "bad_request"
}
```

- HTTP 400

### 5.3 challenge 不正 {#sec_auth_totp_status_challenge}

```json
{
  "ok": false,
  "error": "not_found"
}
```

- HTTP 404
- challenge 不存在、使用済み、期限切れを区別しない

### 5.4 内部エラー {#sec_auth_totp_status_internal_error}

- HTTP 500
- 現実装は body なし

---

## 6. 処理仕様

### 6.1 challengeId 取得 {#sec_auth_totp_status_request}

- `new URL(req.url).searchParams.get('challengeId') ?? ''` で取得する
- 空文字の場合は 400

### 6.2 challenge 検証 {#sec_auth_totp_status_challenge}

```ts
const ch = await prisma.loginChallenge.findUnique({ where: { id: challengeId } });
```

以下の場合は 404。

- `ch` が null
- `ch.used === true`
- `ch.expiresAt` が存在し、現在時刻より過去

### 6.3 ユーザー取得 {#sec_auth_totp_status_user_lookup}

```ts
const u = await prisma.user.findUnique({
  where: { id: ch.userId },
  select: { recoveryCodes: true },
});
```

### 6.4 recoveryRemain 算出 {#sec_auth_totp_status_recovery_count}

- `Array.isArray(u?.recoveryCodes)` が true の場合は配列長
- それ以外は 0

---

## 7. セキュリティ・設計上の注意 {#sec_auth_totp_status_security}

- 本 API はログイン完了前の TOTP 入力画面向け
- Cookie / セッションには依存しない
- challenge 不正の詳細を返さない
- ユーザー存在有無を直接返さない

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 状態取得（GET /api/auth/totp/status）
