[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン一覧取得（GET /api/auth/tokens）

# テストケース：トークン一覧取得（GET /api/auth/tokens）

本書は、トークン一覧取得 API（GET /api/auth/tokens）のテストケース定義を示す。  
※現時点の実装（apps/web/src/app/api/auth/tokens/route.ts）を正とする。

## 1. 前提

- Base URL: /api/auth/tokens
- requireUserId をモックして userId を固定できること
- prisma.syncToken.findMany をモックすること

## 2. テストケース一覧

- AUTH_TOKENS-TC-01 正常：トークン一覧を返す（200）
- AUTH_TOKENS-TC-02 正常：トークンが0件でも空配列（200）
- AUTH_TOKENS-TC-03 異常：未ログイン（401）
- AUTH_TOKENS-TC-04 異常：DB 例外（500 相当）

## 3. テストケース詳細

### AUTH_TOKENS-TC-01 正常：トークン一覧を返す（200）

- 前提
  - requireUserId -> "U1"
  - prisma.syncToken.findMany -> 2件返す
- 入力
  - なし
- 期待結果
  - status=200
  - body が配列
  - 各要素に id/label/createdAt/lastUsedAt/expiresAt が含まれる

### AUTH_TOKENS-TC-02 正常：トークンが0件でも空配列（200）

- 前提：findMany -> []
- 期待結果：status=200, body=[]

### AUTH_TOKENS-TC-03 異常：未ログイン（401）

- 前提：requireUserId が UNAUTHORIZED 相当を throw
- 期待結果：status=401 相当（既定エラー応答に委ねる）

### AUTH_TOKENS-TC-04 異常：DB 例外（500 相当）

- 前提：findMany が throw
- 期待結果：status=500 相当（既定エラー応答に委ねる）

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > トークン一覧取得（GET /api/auth/tokens）
