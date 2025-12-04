[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP設定開始（POST /api/auth/totp/setup）

# テストケース：TOTP設定開始（POST /api/auth/totp/setup）

## 前提

- ベース URL: /api/auth/totp/setup
- ユーザー情報はテストデータで事前に用意する（未有効ユーザー／有効ユーザーなど）
- エラーレスポンス形式は共通仕様に従う

## テストケース一覧

- TOTP-SETUP-TC-01 正常: 未有効ユーザーでセットアップ開始
- TOTP-SETUP-TC-02 異常: 未ログイン（401）
- TOTP-SETUP-TC-03 異常: 既に TOTP 有効化済み（409）
- TOTP-SETUP-TC-04 異常: 内部エラー（500）

## テストケース詳細

### TOTP-SETUP-TC-01 正常: 未有効ユーザーでセットアップ開始

- 前提  
  - ユーザー A はログイン可能で、TOTP 無効（totpSecretEnc 未設定 or disabled）
- 入力  
  - Authorization: ユーザー A の有効トークン  
  - ボディ: なし（または空オブジェクト）
- 期待結果  
  - ステータスコード: 200  
  - レスポンスボディ:  
    - otpauth が "otpauth://" で始まる文字列  
    - svg が "<svg" で始まり "</svg>" で終わる文字列  
  - DB: ユーザー A の totpSecretEnc が非空に更新されている

### TOTP-SETUP-TC-02 異常: 未ログイン（401）

- 入力  
  - Authorization ヘッダーなし
- 期待結果  
  - ステータスコード: 401  

### TOTP-SETUP-TC-03 異常: 既に TOTP 有効化済み（409）

- 前提  
  - ユーザー B は TOTP 有効化済み
- 入力  
  - Authorization: ユーザー B の有効トークン
- 期待結果  
  - ステータスコード: 409  

### TOTP-SETUP-TC-04 異常: 内部エラー（500）

- 前提  
  - QR コード生成や暗号化処理をモックし、例外を発生させる
- 入力  
  - Authorization: 正常なトークン
- 期待結果  
  - ステータスコード: 500  

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP設定開始（POST /api/auth/totp/setup）
