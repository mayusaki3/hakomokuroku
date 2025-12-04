[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP状態取得（GET /api/auth/totp/status）

# テストケース：TOTP状態取得（GET /api/auth/totp/status）

## 前提

- ベース URL: /api/auth/totp/status

## テストケース一覧

- TOTP-STATUS-TC-01 正常: TOTP 有効ユーザー
- TOTP-STATUS-TC-02 正常: TOTP 無効ユーザー
- TOTP-STATUS-TC-03 異常: 未ログイン（401）

## テストケース詳細

### TOTP-STATUS-TC-01 正常: TOTP 有効ユーザー

- 前提  
  - ユーザー A は TOTP 有効
- 入力  
  - Authorization: ユーザー A のトークン
- 期待結果  
  - ステータスコード: 200  
  - レスポンスボディ: enabled が true  
  - recoveryCodesRemaining が 0 以上の整数（回復コード未使用前提）

### TOTP-STATUS-TC-02 正常: TOTP 無効ユーザー

- 前提  
  - ユーザー B は TOTP 無効
- 入力  
  - Authorization: ユーザー B のトークン
- 期待結果  
  - ステータスコード: 200  
  - enabled が false  
  - recoveryCodesRemaining は null か省略（実装ポリシーに合わせる）

### TOTP-STATUS-TC-03 異常: 未ログイン（401）

- 入力  
  - Authorization ヘッダーなし
- 期待結果  
  - ステータスコード: 401  

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP状態取得（GET /api/auth/totp/status）
