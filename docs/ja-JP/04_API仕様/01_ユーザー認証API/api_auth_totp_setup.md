[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP設定開始（POST /api/auth/totp/setup）

# TOTP設定開始（POST /api/auth/totp/setup）

## 概要

ログイン済みユーザーに対して、TOTP（二段階認証）の初期設定を開始する API。  
サーバー側で TOTP シークレットを生成し、otpauth URI と QR コード（SVG）を返す。  
生成したシークレットは、検証成功まで有効化せず、暗号化した状態でユーザーに紐付けて保存する。

## エンドポイント

- Method: POST  
- Path: /api/auth/totp/setup

## 認可

- 要ログイン（Authorization ヘッダー必須）
- 共通仕様（04_API仕様/00_共通仕様.md）で定める認証方式に従う

## リクエスト

### ヘッダー

- Authorization: Bearer \<token\>（必須）
- Content-Type: application/json（推奨）

### ボディ

現時点ではパラメータなし。空オブジェクトまたはボディなしを許容する。

```json
{}
```

## レスポンス

### 正常系（200 OK）

```json
{
  "otpauth": "otpauth://totp/hakomokuroku:userId?secret=XXXXX&issuer=hakomokuroku",
  "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" ...>...</svg>"
}
```

- otpauth  
  - 認証アプリ向け otpauth URI（Base32 シークレットを含む）
- svg  
  - otpauth を QR コード化した SVG 文字列

### 異常系

- 401 Unauthorized  
  - ログインしていない、またはトークンが無効な場合
- 500 Internal Server Error  
  - シークレット生成、暗号化、DB 保存、QR 生成など内部エラーが発生した場合

エラーレスポンス形式は共通仕様に従う。例:

```json
{
  "error": "unauthorized",
  "message": "Authentication required."
}
```

## 備考

- この API 実行時点では、TOTP はまだ「有効化」されない。  
- 後続の /api/auth/totp/verify 正常完了後に TOTP 有効フラグを立てる実装を想定する。

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP設定開始（POST /api/auth/totp/setup）
