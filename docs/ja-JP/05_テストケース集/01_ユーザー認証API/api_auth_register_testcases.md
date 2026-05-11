[目次](../../目次.md) > テストケース集 > ユーザー認証API > ユーザー登録（POST /api/auth/register）

# テストケース：ユーザー登録（POST /api/auth/register）

本書は、ユーザー登録 API（POST /api/auth/register）のテストケース定義を示す。  
※現時点の実装（apps/web/src/app/api/auth/register/route.ts）を正とする。

## 1. 前提

- Base URL: /api/auth/register
- DB は Prisma をモックし、DBアクセスはすべてモック関数で代替する

---

## 2. 対応仕様

| テストケースID | 対応 sec_id | 検証責務 |
|---|---|---|
| AUTH_REGISTER-TC-01 | sec_auth_register_success / sec_auth_register_security | 新規ユーザー登録と passwordHash 保存 |
| AUTH_REGISTER-TC-02 | sec_auth_register_invalid_request | Content-Type 不正を 400 にする |
| AUTH_REGISTER-TC-03 | sec_auth_register_invalid_request | JSON パース不正を 400 にする |
| AUTH_REGISTER-TC-04 | sec_auth_register_invalid_request | userId 不正を 400 にする |
| AUTH_REGISTER-TC-05 | sec_auth_register_invalid_request | password 不正を 400 にする |
| AUTH_REGISTER-TC-06 | sec_auth_register_conflict | 既存 userId を 409 にする |
| AUTH_REGISTER-TC-07 | sec_auth_register_internal_error | DB 例外を 500 相当にする |
| AUTH_REGISTER-TC-08 | sec_auth_register_invalid_request | Content-Type ヘッダ無しを 400 にする |
| AUTH_REGISTER-TC-09 | sec_auth_register_invalid_request | Content-Type ヘッダ無しを 400 にする |
| AUTH_REGISTER-TC-10 | sec_auth_register_invalid_request | JSON が null の場合を 400 にする |
| AUTH_REGISTER-TC-11 | sec_auth_register_conflict | userId trim 後の既存判定を確認する |

---

## 3. テストケース一覧

- AUTH_REGISTER-TC-01 正常：新規ユーザー登録（200）
- AUTH_REGISTER-TC-02 異常：Content-Type 不正（400）
- AUTH_REGISTER-TC-03 異常：JSON パース不正（400）
- AUTH_REGISTER-TC-04 異常：userId 未指定/空/非string（400）
- AUTH_REGISTER-TC-05 異常：password 未指定/空/非string（400）
- AUTH_REGISTER-TC-06 異常：既に登録済み（409）
- AUTH_REGISTER-TC-07 異常：DB 例外（500 相当）
- AUTH_REGISTER-TC-08 異常：Content-Type ヘッダ無し（400）
- AUTH_REGISTER-TC-09 異常：Content-Type ヘッダ無し（400）
- AUTH_REGISTER-TC-10 異常：JSON が null（400）
- AUTH_REGISTER-TC-11 userId は trim して既存判定する（409）

---

## 4. テストケース詳細

### AUTH_REGISTER-TC-01 正常：新規ユーザー登録（200）

- 対応 sec_id:
  - sec_auth_register_success
  - sec_auth_register_security
- 前提
  - prisma.user.findFirst -> null（未登録）
  - prisma.user.create -> 成功
- 入力
  - Headers: Content-Type=application/json
  - Body: { userId:"u1", password:"p1" }
- 期待結果
  - status=200
  - body={ ok:true }
  - prisma.user.create が 1回呼ばれる
  - passwordHash は平文と異なる
  - passwordHash は string

### AUTH_REGISTER-TC-02 異常：Content-Type 不正（400）

- 対応 sec_id:
  - sec_auth_register_invalid_request
- 入力：Content-Type=text/plain（など）
- 期待結果
  - status=400
  - body={ ok:false, error:"bad_request" }

### AUTH_REGISTER-TC-03 異常：JSON パース不正（400）

- 対応 sec_id:
  - sec_auth_register_invalid_request
- 入力：Content-Type=application/json, 壊れたJSON
- 期待結果
  - status=400

### AUTH_REGISTER-TC-04 異常：userId 未指定/空/非string（400）

- 対応 sec_id:
  - sec_auth_register_invalid_request
- パターン例
  - {}
  - { userId:"", password:"p" }
  - { userId: 123, password:"p" }
- 期待結果
  - status=400

### AUTH_REGISTER-TC-05 異常：password 未指定/空/非string（400）

- 対応 sec_id:
  - sec_auth_register_invalid_request
- パターン例
  - password 未指定
  - password が空文字
  - password が string 以外
- 期待結果
  - status=400

### AUTH_REGISTER-TC-06 異常：既に登録済み（409）

- 対応 sec_id:
  - sec_auth_register_conflict
- 前提
  - prisma.user.findFirst -> 既存ユーザーを返す
- 期待結果
  - status=409
  - body={ ok:false, error:"already_exists" }
  - prisma.user.create は呼ばれない

### AUTH_REGISTER-TC-07 異常：DB 例外（500 相当）

- 対応 sec_id:
  - sec_auth_register_internal_error
- 前提
  - prisma.user.findFirst または prisma.user.create が throw
- 期待結果
  - status=500 相当
  - body は厳密固定しない

### AUTH_REGISTER-TC-08 異常：Content-Type ヘッダ無し（400）

- 対応 sec_id:
  - sec_auth_register_invalid_request
- 条件
  - Content-Type ヘッダ無し
- 期待結果
  - status=400

### AUTH_REGISTER-TC-09 異常：Content-Type ヘッダ無し（400）

- 対応 sec_id:
  - sec_auth_register_invalid_request
- 条件
  - headers.get("content-type") が null
- 期待結果
  - status=400

### AUTH_REGISTER-TC-10 異常：JSON が null（400）

- 対応 sec_id:
  - sec_auth_register_invalid_request
- 条件
  - req.json() が null を返す
- 期待結果
  - status=400

### AUTH_REGISTER-TC-11 userId は trim して既存判定する（409）

- 対応 sec_id:
  - sec_auth_register_conflict
  - sec_auth_register_security
- 条件
  - userId に前後空白が含まれる
  - trim 後の userId が既存ユーザーと一致する
- 期待結果
  - status=409
  - prisma.user.create は呼ばれない

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > ユーザー登録（POST /api/auth/register）
