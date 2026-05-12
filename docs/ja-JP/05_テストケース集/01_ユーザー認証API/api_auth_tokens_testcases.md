[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン一覧取得（GET /api/auth/tokens）

# テストケース：トークン一覧取得（GET /api/auth/tokens）

本書は、トークン一覧取得 API（GET /api/auth/tokens）のテストケース定義を示す。  
※現時点の実装（apps/web/src/app/api/auth/tokens/route.ts）および Vitest（apps/web/tests/api.auth.tokens.spec.ts）を正とする。

## 1. 前提

- Base URL: /api/auth/tokens
- requireUserId をモックして userId を固定できること
- prisma.syncToken.findMany をモックすること
- GET だが、現行実装では Content-Type: application/json を要求する

---

## 2. Traceability

| テストケースID | 対応 sec_id | 検証責務 |
|---|---|---|
| AUTH_TOKENS-TC-01 | sec_auth_tokens_content_type / sec_auth_tokens_require_user / sec_auth_tokens_success | トークン一覧を 200 で返す |
| AUTH_TOKENS-TC-02 | sec_auth_tokens_content_type / sec_auth_tokens_require_user / sec_auth_tokens_empty | 0件でも 200 + [] を返す |
| AUTH_TOKENS-TC-03 | sec_auth_tokens_unauthorized | 未ログインを 401 にする |
| AUTH_TOKENS-TC-04 | sec_auth_tokens_content_type | Content-Type 不正を 400 にする |
| AUTH_TOKENS-TC-05 | sec_auth_tokens_db_error | DB 例外を 500 相当にする |
| AUTH_TOKENS-TC-06 | sec_auth_tokens_content_type | Content-Type ヘッダ無しを 400 にする |
| AUTH_TOKENS-TC-07 | sec_auth_tokens_forbidden | 認可エラー status をそのまま返す |
| AUTH_TOKENS-TC-08 | sec_auth_tokens_unauthorized | status 無し例外を 401 にする |

---

## 3. テストケース一覧

- AUTH_TOKENS-TC-01 正常：トークン一覧を返す（200）
- AUTH_TOKENS-TC-02 正常：0件でも空配列（200）
- AUTH_TOKENS-TC-03 異常：未ログイン（401）
- AUTH_TOKENS-TC-04 異常：Content-Type 不正（400）
- AUTH_TOKENS-TC-05 異常：DB 例外（500 相当）
- AUTH_TOKENS-TC-06 異常：Content-Type ヘッダ無し（400）
- AUTH_TOKENS-TC-07 異常：認可エラー（403 など）をそのまま返す
- AUTH_TOKENS-TC-08 異常：requireUserId が status 無し例外でも 401

---

## 4. テストケース詳細

### AUTH_TOKENS-TC-01 正常：トークン一覧を返す（200）

#### 対応 sec_id

- sec_auth_tokens_content_type
- sec_auth_tokens_require_user
- sec_auth_tokens_success

#### 前提

- requireUserId -> "U1"
- prisma.syncToken.findMany -> 2件返す
- Content-Type: application/json

#### 入力

- GET /api/auth/tokens

#### 期待結果

- status=200
- body が配列
- body は findMany の結果と一致する

---

### AUTH_TOKENS-TC-02 正常：0件でも空配列（200）

#### 対応 sec_id

- sec_auth_tokens_content_type
- sec_auth_tokens_require_user
- sec_auth_tokens_empty

#### 前提

- requireUserId -> "U1"
- prisma.syncToken.findMany -> []
- Content-Type: application/json

#### 期待結果

- status=200
- body=[]

---

### AUTH_TOKENS-TC-03 異常：未ログイン（401）

#### 対応 sec_id

- sec_auth_tokens_unauthorized

#### 前提

- requireUserId が status=401 相当を throw

#### 期待結果

- status=401

---

### AUTH_TOKENS-TC-04 異常：Content-Type 不正（400）

#### 対応 sec_id

- sec_auth_tokens_content_type

#### 条件

- Content-Type が application/json ではない

#### 期待結果

- status=400

---

### AUTH_TOKENS-TC-05 異常：DB 例外（500 相当）

#### 対応 sec_id

- sec_auth_tokens_db_error

#### 前提

- requireUserId -> "U1"
- prisma.syncToken.findMany が throw

#### 期待結果

- status >= 500

---

### AUTH_TOKENS-TC-06 異常：Content-Type ヘッダ無し（400）

#### 対応 sec_id

- sec_auth_tokens_content_type

#### 条件

- Content-Type ヘッダ無し

#### 期待結果

- status=400

---

### AUTH_TOKENS-TC-07 異常：認可エラー（403 など）をそのまま返す

#### 対応 sec_id

- sec_auth_tokens_forbidden

#### 前提

- requireUserId が status=403 を持つ例外を throw

#### 期待結果

- status=403

---

### AUTH_TOKENS-TC-08 異常：requireUserId が status 無し例外でも 401

#### 対応 sec_id

- sec_auth_tokens_unauthorized

#### 前提

- requireUserId が status を持たない例外を throw

#### 期待結果

- status=401

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン一覧取得（GET /api/auth/tokens）
