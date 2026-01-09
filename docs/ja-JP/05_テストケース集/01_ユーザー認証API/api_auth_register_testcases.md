[目次](../../目次.md) > テストケース集 > ユーザー認証API > ユーザー登録（POST /api/auth/register）

# テストケース：ユーザー登録（POST /api/auth/register）

本書は、ユーザー登録 API（POST /api/auth/register）のテストケース定義を示す。  
※現時点の実装（apps/web/src/app/api/auth/register/route.ts）を正とする。

## 1. 前提

- Base URL: /api/auth/register
- DB は Prisma をモックし、DBアクセスはすべてモック関数で代替する

## 2. テストケース一覧

- AUTH_REGISTER-TC-01 正常：新規ユーザー登録（200）
- AUTH_REGISTER-TC-02 異常：Content-Type 不正（400）
- AUTH_REGISTER-TC-03 異常：JSON パース不正（400）
- AUTH_REGISTER-TC-04 異常：userId 未指定/空/非string（400）
- AUTH_REGISTER-TC-05 異常：password 未指定/空/非string（400）
- AUTH_REGISTER-TC-06 異常：既に登録済み（409）
- AUTH_REGISTER-TC-07 異常：DB 例外（500 相当）

## 3. テストケース詳細

### AUTH_REGISTER-TC-01 正常：新規ユーザー登録（200）

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
  - passwordHash は平文と異なる（ハッシュ化されている）こと（厳密比較は不要、string であること程度）

### AUTH_REGISTER-TC-02 異常：Content-Type 不正（400）

- 入力：Content-Type=text/plain（など）
- 期待結果
  - status=400
  - body={ ok:false, error:"bad_request" }

### AUTH_REGISTER-TC-03 異常：JSON パース不正（400）

- 入力：Content-Type=application/json, Body="{"（壊れたJSON）
- 期待結果：status=400

### AUTH_REGISTER-TC-04 異常：userId 未指定/空/非string（400）

- パターン例
  - {}
  - { userId:"", password:"p" }
  - { userId: 123, password:"p" }
- 期待結果：status=400

### AUTH_REGISTER-TC-05 異常：password 未指定/空/非string（400）

- パターン例
  - { userId:"u", passwordorei: "p" }（キー誤り）
  - { userId:"u", password:"" }
  - { userId:"u", password: 123 }
- 期待結果：status=400

### AUTH_REGISTER-TC-06 異常：既に登録済み（409）

- 前提：prisma.user.findFirst -> 既存ユーザーを返す
- 期待結果
  - status=409
  - body={ ok:false, error:"already_exists" }
  - prisma.user.create は呼ばれない

### AUTH_REGISTER-TC-07 異常：DB 例外（500 相当）

- 前提：prisma.user.findFirst または prisma.user.create が throw
- 期待結果
  - status=500 相当（Next.js の既定エラー応答に委ねる）
  - body は厳密固定しない（ok:false を返す実装ではないため）

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > ユーザー登録（POST /api/auth/register）
