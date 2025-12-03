[目次](../目次.md) > テストケース集 > ログイン（POST /api/auth/login）

# テストケース：ログイン（POST /api/auth/login）

## AUTH_LOGIN-TC-01 正常ログイン
- 条件: 正しい email/password
- 期待: 200, ok:true, user.id が返る, Cookie 設定あり

## AUTH_LOGIN-TC-02 email 不正フォーマット
- 条件: "abc"
- 期待: 400

## AUTH_LOGIN-TC-03 パラメータ不足
- 条件: password 未指定
- 期待: 400

## AUTH_LOGIN-TC-04 認証失敗（メール不一致）
- 条件: 登録されていない email
- 期待: 401

## AUTH_LOGIN-TC-05 認証失敗（パスワード不一致）
- 条件: password 不一致
- 期待: 401

## AUTH_LOGIN-TC-06 内部例外
- 条件: prisma が例外を投げる
- 期待: 500

---
[目次](../目次.md) > テストケース集 > ログイン（POST /api/auth/login）