[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）

# TOTP有効化確認（POST /api/auth/totp/verify）

## 1. 概要

`/api/auth/totp/setup` により生成された TOTP 秘密鍵（pending secret）に対して、  
ユーザーが認証アプリで生成した TOTP コードを検証し、正しければ TOTP を有効化する API。

本 API は **sid Cookie によるログイン状態** を前提とする。

---

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/totp/verify |

---

## 3. 認可

- **要ログイン（sid Cookie）**
- Authorization ヘッダーは使用しない

---

## 4. リクエスト

### 4.1 ヘッダー

- Content-Type: application/json（必須）

### 4.2 ボディ

```json
{
  "code": "123456"
}
```

| フィールド | 必須 | 説明 |
|-----------|------|------|
| code | 必須 | TOTP 認証アプリが生成した 6 桁コード（文字列） |

---

## 5. レスポンス仕様

### 5.1 正常系（200 OK）

```json
{
  "ok": true,
  "recoveryCodes": [
    "ABCD-1234",
    "EFGH-5678"
  ]
}
```

| フィールド | 説明 |
|-----------|------|
| ok | 常に true |
| recoveryCodes | TOTP 初回有効化時に生成される回復コード一覧 |

---

## 6. 異常系（エラー時レスポンス形式）

エラー時は共通仕様に従い、以下の形式を返す。

```json
{ "ok": false, "error": "ERROR_CODE" }
```

---

## 7. ステータスコード・エラー仕様

| 状況 | ステータス | error | 説明 |
|------|-----------|--------|------|
| code が未指定 / 空文字 / 6 桁以外 | 400 | `"INVALID_CODE_FORMAT"` | リクエスト形式が不正 |
| 未ログイン（sid 無効） | 401 | `"UNAUTHORIZED"` | セッションが無い |
| setup 未実行（pending secret 無し） | 409 | `"CONFLICT_STATE"` | 前提状態が不正 |
| 既に TOTP 有効化済み | 409 | `"CONFLICT_STATE"` | 二重有効化防止 |
| code が形式上は正しいが一致しない／期限切れ | 422 | `"INVALID_CODE"` | 検証失敗 |
| サーバー内部例外 | 500 | `"internal error"` | 予期せぬエラー |

---

## 8. 備考

- 本 API により TOTP が有効化された後、ユーザーの `totpEnabled` が true となり、回復コードもストアされる。  
- 回復コードは実装上 **毎回生成されるわけではなく、初回のみ生成** されるため、この仕様に従う。  

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）
