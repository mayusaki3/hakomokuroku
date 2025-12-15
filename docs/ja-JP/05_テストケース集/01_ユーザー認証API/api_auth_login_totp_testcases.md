[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）

# テストケース：ログイン2段階認証（POST /api/auth/login/totp）

## 1. 前提
- ベース URL: /api/auth/login/totp
- Cookie `sid` を使用
- ユーザー状態（`totpEnabled` / `totpSecretEnc` / `recoveryCodes` / `totpFailCount` / `lockUntil`）を DB モックで制御

## 2. テストケース一覧
- AUTH_LOGIN_TOTP-TC-01 正常: 正しい TOTP code（200）
- AUTH_LOGIN_TOTP-TC-02 正常: 正しい recovery code（200、かつコードが消費される）
- AUTH_LOGIN_TOTP-TC-03 異常: 未ログイン（401）
- AUTH_LOGIN_TOTP-TC-04 異常: code 未指定/空（400）
- AUTH_LOGIN_TOTP-TC-05 異常: code 形式不正（400）
- AUTH_LOGIN_TOTP-TC-06 異常: code 不一致（401）
- AUTH_LOGIN_TOTP-TC-07 異常: TOTP 未有効（409）
- AUTH_LOGIN_TOTP-TC-08 異常: recovery code 再利用（401/422 相当）
- AUTH_LOGIN_TOTP-TC-09 異常: 連続失敗で lockUntil により拒否（401/429 相当）※実装がある場合

## 3. テストケース詳細

### AUTH_LOGIN_TOTP-TC-01 正常: 正しい TOTP code（200）
- 前提: User A `totpEnabled=true`, `totpSecretEnc` あり
- 入力: sid（User A）+ 正しい 6桁
- 期待: 200 + `{ok:true}`

### AUTH_LOGIN_TOTP-TC-02 正常: 正しい recovery code（200、かつコードが消費される）
- 前提
  - User A `recoveryCodes` に「未使用コード」が含まれる
- 手順
  1) sid + recovery code で実行
  2) 同じ recovery code で再度実行
- 期待
  - 1) 200
  - 2) 401/422 相当（再利用不可）

### AUTH_LOGIN_TOTP-TC-03 異常: 未ログイン（401）
- 入力: Cookie なし
- 期待: 401

### AUTH_LOGIN_TOTP-TC-04 異常: code 未指定/空（400）
- 入力: {} / {"code":""}
- 期待: 400

### AUTH_LOGIN_TOTP-TC-05 異常: code 形式不正（400）
- 入力: {"code":"!!!!"} / {"code":"12345"} 等
- 期待: 400

### AUTH_LOGIN_TOTP-TC-06 異常: code 不一致（401）
- 入力: 形式OKだが不正な 6 桁 / 不正な recovery code
- 期待: 401

### AUTH_LOGIN_TOTP-TC-07 異常: TOTP 未有効（409）
- 前提: User B `totpEnabled=false`
- 期待: 409

### AUTH_LOGIN_TOTP-TC-08 異常: recovery code 再利用（401/422 相当）
- 期待: TC-02 の 2) で担保

### AUTH_LOGIN_TOTP-TC-09 異常: 連続失敗で lockUntil により拒否（401/429 相当）
- 前提: `lockUntil` が未来
- 期待: 401/429（実装準拠）

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）
