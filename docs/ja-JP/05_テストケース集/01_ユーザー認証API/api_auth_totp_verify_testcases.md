[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）

# テストケース：TOTP有効化確認（POST /api/auth/totp/verify）

## 前提

- ベース URL: /api/auth/totp/verify
- /api/auth/totp/setup により一時シークレットが保存されている状態をテストデータで用意する

## テストケース一覧

- TOTP-VERIFY-TC-01 正常: 未有効ユーザーが正しいコードを送信
- TOTP-VERIFY-TC-02 異常: code 未指定（400）
- TOTP-VERIFY-TC-03 異常: code のフォーマット不正（400）
- TOTP-VERIFY-TC-04 異常: code 不一致（422）
- TOTP-VERIFY-TC-05 異常: 未ログイン（401）
- TOTP-VERIFY-TC-06 異常: setup 未実行（409）
- TOTP-VERIFY-TC-07 異常: 既に有効化済み（409）

## テストケース詳細

### TOTP-VERIFY-TC-01 正常: 未有効ユーザーが正しいコードを送信

- 前提  
  - ユーザー A は /setup を完了しているが、まだ TOTP 無効フラグ  
  - テスト用シークレットと時刻から期待される 6 桁コードを事前に求めておく
- 入力  
  - Authorization: ユーザー A のトークン  
  - Body: 正しい code
- 期待結果  
  - ステータスコード: 200  
  - enabled が true  
  - recoveryCodes が配列で返る（実装に合わせて要素数確認）  
  - DB: ユーザー A の TOTP 状態が有効化されている

### TOTP-VERIFY-TC-02 異常: code 未指定（400）

- 入力  
  - Body: {} または {"code": ""} など
- 期待結果  
  - ステータスコード: 400  

### TOTP-VERIFY-TC-03 異常: code のフォーマット不正（400）

- 入力  
  - Body: {"code": "abc123"} など、6 桁数字以外
- 期待結果  
  - ステータスコード: 400  

### TOTP-VERIFY-TC-04 異常: code 不一致（422）

- 入力  
  - フォーマットは正しいが不正な 6 桁（例: "000000"）
- 期待結果  
  - ステータスコード: 422  

### TOTP-VERIFY-TC-05 異常: 未ログイン（401）

- 入力  
  - Authorization ヘッダーなし
- 期待結果  
  - ステータスコード: 401  

### TOTP-VERIFY-TC-06 異常: setup 未実行（409）

- 前提  
  - ユーザー B は setup 未実行
- 入力  
  - Authorization: ユーザー B のトークン  
  - Body: 正しい形式の code
- 期待結果  
  - ステータスコード: 409  

### TOTP-VERIFY-TC-07 異常: 既に有効化済み（409）

- 前提  
  - ユーザー C は既に TOTP 有効化済み
- 入力  
  - Authorization: ユーザー C のトークン  
  - Body: 正しい形式の code
- 期待結果  
  - ステータスコード: 409  

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）
