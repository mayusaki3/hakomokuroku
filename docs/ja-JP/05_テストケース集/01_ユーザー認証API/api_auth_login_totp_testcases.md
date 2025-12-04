[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTPログイン確認（POST /api/auth/login/totp）

# テストケース：TOTPログイン確認（POST /api/auth/login/totp）

## 前提

- ベース URL: /api/auth/login/totp
- /api/auth/login でパスワード認証が成功し、TOTP が有効なユーザーに対して  
  一時的な loginId が払い出されている前提

## テストケース一覧

- TOTP-LOGIN-TC-01 正常: 正しい 6 桁コードでログイン完了
- TOTP-LOGIN-TC-02 正常: 正しい回復コードでログイン完了
- TOTP-LOGIN-TC-03 異常: loginId 未指定（400）
- TOTP-LOGIN-TC-04 異常: code / recoveryCode 両方未指定（400）
- TOTP-LOGIN-TC-05 異常: 不正 loginId（404）
- TOTP-LOGIN-TC-06 異常: loginId の状態が TOTP チャレンジでない（409）
- TOTP-LOGIN-TC-07 異常: コード不一致（422）
- TOTP-LOGIN-TC-08 異常: 内部エラー（500）

## テストケース詳細

### TOTP-LOGIN-TC-01 正常: 正しい 6 桁コードでログイン完了

- 前提  
  - /api/auth/login 呼び出しで、TOTP 必須ユーザーに対して loginId が取得済み
- 入力  
  - Body: {"loginId": "<有効ID>", "code": "<正しい6桁>"}
- 期待結果  
  - ステータスコード: 200  
  - レスポンスボディ: token が非空文字列  
  - 取得した token を用いた /api/auth/me が 200 を返す（別ケースで確認）

### TOTP-LOGIN-TC-02 正常: 正しい回復コードでログイン完了

- 前提  
  - loginId が有効な TOTP チャレンジ状態  
  - 有効な回復コードが存在
- 入力  
  - Body: {"loginId": "<有効ID>", "recoveryCode": "<有効な回復コード>"}
- 期待結果  
  - ステータスコード: 200  
  - token が返る

### TOTP-LOGIN-TC-03 異常: loginId 未指定（400）

- 入力  
  - Body: {"code": "123456"}
- 期待結果  
  - ステータスコード: 400  

### TOTP-LOGIN-TC-04 異常: code / recoveryCode 両方未指定（400）

- 入力  
  - Body: {"loginId": "<有効ID>"}
- 期待結果  
  - ステータスコード: 400  

### TOTP-LOGIN-TC-05 異常: 不正 loginId（404）

- 入力  
  - Body: {"loginId": "non-existent", "code": "123456"}
- 期待結果  
  - ステータスコード: 404  

### TOTP-LOGIN-TC-06 異常: loginId の状態が TOTP チャレンジでない（409）

- 前提  
  - loginId が別フローに紐づく、または既に処理済み
- 入力  
  - Body: {"loginId": "<不正状態ID>", "code": "123456"}
- 期待結果  
  - ステータスコード: 409  

### TOTP-LOGIN-TC-07 異常: コード不一致（422）

- 入力  
  - Body: {"loginId": "<有効ID>", "code": "000000"}
- 期待結果  
  - ステータスコード: 422  

### TOTP-LOGIN-TC-08 異常: 内部エラー（500）

- 前提  
  - TOTP 検証またはトークン発行処理をモックで例外発生させる
- 入力  
  - Body: {"loginId": "<有効ID>", "code": "123456"}
- 期待結果  
  - ステータスコード: 500  

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTPログイン確認（POST /api/auth/login/totp）
