[目次](../../目次.md) > テストケース集 > ユーザー認証API > ユーザー情報取得（GET /api/auth/me）

# テストケース：ユーザー情報取得（GET /api/auth/me）

## AUTH_ME-TC-01 正常（ログイン中）
- 条件: 有効なセッション
- 期待: 200, ok:true, user が返る

## AUTH_ME-TC-02 未ログイン
- 条件: Cookie なし（または readSession が ok:false を返す）
- 期待: 200, ok:false

## AUTH_ME-TC-03 readSession が例外
- 条件: モックで例外を投げる
- 期待: 200, ok:false（仕様固定）

## AUTH_ME-TC-04 ok:true かつ user:null の挙動
- 条件: readSession が { ok:true, user:null } を返す（防御的実装の想定）
- 期待:
  - ステータス: 200 または 401（実装依存）
  - 200 の場合: ok:false で返る

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > ユーザー情報取得（GET /api/auth/me）
