[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）

# テストケース：トークン失効（POST /api/auth/tokens/revoke）

本書は、トークン失効 API（POST /api/auth/tokens/revoke）のテストケース定義を示す。  
※現時点の実装（apps/web/src/app/api/auth/tokens/revoke/route.ts）を正とする。

## 1. 前提

- Base URL: /api/auth/tokens/revoke
- requireUserId をモックして userId を固定できること
- prisma.syncToken.deleteMany をモックすること

## 2. テストケース一覧

- AUTH_TOKENS_REVOKE-TC-01 正常：token を失効（204）
- AUTH_TOKENS_REVOKE-TC-02 異常：未ログイン（401）
- AUTH_TOKENS_REVOKE-TC-03 異常：Content-Type 不正（400）
- AUTH_TOKENS_REVOKE-TC-04 異常：JSON パース不正（400）
- AUTH_TOKENS_REVOKE-TC-05 異常：token 未指定/非string（400）
- AUTH_TOKENS_REVOKE-TC-06 異常：対象トークンなし（404）
- AUTH_TOKENS_REVOKE-TC-07 異常：DB 例外（500 相当）

## 3. テストケース詳細

### AUTH_TOKENS_REVOKE-TC-01 正常：token を失効（204）

- 前提
  - requireUserId -> "U1"
  - deleteMany -> { count: 1 }
- 入力
  - Headers: Content-Type=application/json
  - Body: { token:"t1" }
- 期待結果
  - status=204
  - body なし（res.text() が空）
  - deleteMany が userId="U1" と tokenHash 条件で呼ばれる

### AUTH_TOKENS_REVOKE-TC-06 異常：対象トークンなし（404）

- 前提：deleteMany -> { count: 0 }
- 期待結果：status=404, body={ error:"not_found" }

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン失効（POST /api/auth/tokens/revoke）
