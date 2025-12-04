[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP無効化（POST /api/auth/totp/disable）

# テストケース：TOTP無効化（POST /api/auth/totp/disable）

## 前提

- ベース URL: /api/auth/totp/disable
- ユーザー A は TOTP 有効化済み

## テストケース一覧

- TOTP-DISABLE-TC-01 正常: 正しい TOTP コードで無効化
- TOTP-DISABLE-TC-02 正常: 正しい回復コードで無効化
- TOTP-DISABLE-TC-03 異常: code / recoveryCode 両方未指定（400）
- TOTP-DISABLE-TC-04 異常: code 不正（403）
- TOTP-DISABLE-TC-05 異常: TOTP 無効ユーザーが呼び出し（409）
- TOTP-DISABLE-TC-06 異常: 未ログイン（401）

## テストケース詳細

### TOTP-DISABLE-TC-01 正常: 正しい TOTP コードで無効化

- 前提  
  - ユーザー A の TOTP が有効化済み  
  - 現在の有効な 6 桁コードを把握しておく
- 入力  
  - Authorization: ユーザー A のトークン  
  - Body: {"code": "<正しい6桁>"}
- 期待結果  
  - ステータスコード: 200  
  - enabled が false  
  - DB: ユーザー A の TOTP 状態が無効になっている

### TOTP-DISABLE-TC-02 正常: 正しい回復コードで無効化

- 前提  
  - ユーザー A に有効な回復コードが残っている
- 入力  
  - Body: {"recoveryCode": "<有効な回復コード>"}
- 期待結果  
  - ステータスコード: 200  
  - enabled が false  

### TOTP-DISABLE-TC-03 異常: code / recoveryCode 両方未指定（400）

- 入力  
  - Body: {}
- 期待結果  
  - ステータスコード: 400  

### TOTP-DISABLE-TC-04 異常: code 不正（403）

- 入力  
  - Body: {"code": "000000"} （フォーマットは正しいが検証失敗）
- 期待結果  
  - ステータスコード: 403  

### TOTP-DISABLE-TC-05 異常: TOTP 無効ユーザーが呼び出し（409）

- 前提  
  - ユーザー B は TOTP 無効
- 入力  
  - Authorization: ユーザー B のトークン  
  - Body: 任意
- 期待結果  
  - ステータスコード: 409  

### TOTP-DISABLE-TC-06 異常: 未ログイン（401）

- 入力  
  - Authorization ヘッダーなし
- 期待結果  
  - ステータスコード: 401  

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP無効化（POST /api/auth/totp/disable）
