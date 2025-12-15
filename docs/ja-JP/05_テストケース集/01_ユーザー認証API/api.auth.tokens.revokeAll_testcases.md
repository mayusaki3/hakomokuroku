[目次](../../目次.md) > テストケース集 > ユーザー認証API > 全トークン失効（POST /api/auth/tokens/revokeAll）

# テストケース：全トークン失効（POST /api/auth/tokens/revokeAll）

本書は、全トークン失効 API（POST /api/auth/tokens/revokeAll）のテストケース定義を示す。  
※現時点の実装（apps/web/src/app/api/auth/tokens/revokeAll/route.ts）を正とする。

## 1. 前提

- Base URL: /api/auth/tokens/revokeAll
- requireUserId をモックして userId を固定できること
- prisma.syncToken.deleteMany をモックすること

## 2. テストケース一覧

- AUTH_TOKENS_REVOKEALL-TC-01 正常：全トークン削除（204）
- AUTH_TOKENS_REVOKEALL-TC-02 異常：未ログイン（401）
- AUTH_TOKENS_REVOKEALL-TC-03 異常：Content-Type 不正（400）
- AUTH_TOKENS_REVOKEALL-TC-04 異常：DB 例外（500 相当）

## 3. テストケース詳細

### AUTH_TOKENS_REVOKEALL-TC-01 正常：全トークン削除（204）

- 前提
  - requireUserId -> "U1"
  - deleteMany -> { count: 3 }（件数は任意）
- 入力
  - Headers: Content-Type=application/json
- 期待結果
  - status=204
  - deleteMany が where:{ userId:"U1" } で呼ばれる

### AUTH_TOKENS_REVOKEALL-TC-03 異常：Content-Type 不正（400）

- 入力：Content-Type 未指定、または text/plain
- 期待結果：status=400, body={ error:"bad_request" }

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > 全トークン失効（POST /api/auth/tokens/revokeAll）
