[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークンラベル更新（POST /api/auth/tokens/label）

# テストケース：トークンラベル更新（POST /api/auth/tokens/label）

本書は、トークンラベル更新 API（POST /api/auth/tokens/label）のテストケース定義を示す。  
※現時点の実装（apps/web/src/app/api/auth/tokens/label/route.ts）を正とする。

## 1. 前提

- Base URL: /api/auth/tokens/label
- requireUserId をモックして userId を固定できること
- prisma.syncToken.updateMany をモックすること

## 2. テストケース一覧

- AUTH_TOKENS_LABEL-TC-01 正常：body.token 指定でラベル更新（200）
- AUTH_TOKENS_LABEL-TC-02 正常：body.token 未指定 → Cookie(hk_token) で更新（200）
- AUTH_TOKENS_LABEL-TC-03 異常：未ログイン（401）
- AUTH_TOKENS_LABEL-TC-04 異常：Content-Type 不正（400）
- AUTH_TOKENS_LABEL-TC-05 異常：JSON パース不正（400）
- AUTH_TOKENS_LABEL-TC-06 異常：label 未指定/非string（400）
- AUTH_TOKENS_LABEL-TC-07 異常：token 解決不可（400）
- AUTH_TOKENS_LABEL-TC-08 異常：対象トークンなし（404）
- AUTH_TOKENS_LABEL-TC-09 異常：DB 例外（500 相当）

## 3. テストケース詳細

### AUTH_TOKENS_LABEL-TC-01 正常：body.token 指定でラベル更新（200）

- 前提
  - requireUserId -> "U1"
  - updateMany -> { count: 1 }
- 入力
  - Headers: Content-Type=application/json
  - Body: { token:"t1", label:"L1" }
- 期待結果
  - status=200
  - body={ ok:true }
  - updateMany が tokenHash と userId="U1" を条件に呼ばれる

### AUTH_TOKENS_LABEL-TC-02 正常：body.token 未指定 → Cookie(hk_token) で更新（200）

- 前提：updateMany -> { count: 1 }
- 入力
  - Cookie: hk_token=t1
  - Body: { label:"L1" }
- 期待結果：status=200

### AUTH_TOKENS_LABEL-TC-06 異常：label 未指定/非string（400）

- パターン例
  - {}
  - { token:"t1" }
  - { token:"t1", label: 123 }
- 期待結果：status=400, body={ error:"bad_request" }

### AUTH_TOKENS_LABEL-TC-07 異常：token 解決不可（400）

- 入力：Body に token なし、Cookie に hk_token なし
- 期待結果：status=400

### AUTH_TOKENS_LABEL-TC-08 異常：対象トークンなし（404）

- 前提：updateMany -> { count: 0 }
- 期待結果：status=404, body={ error:"not_found" }

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークンラベル更新（POST /api/auth/tokens/label）
