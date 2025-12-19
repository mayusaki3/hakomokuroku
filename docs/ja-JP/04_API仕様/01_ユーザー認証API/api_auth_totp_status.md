[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 状態取得（GET /api/auth/totp/status）

# TOTP 状態取得（GET /api/auth/totp/status）

本書は、ログイン途中で使用する  
**TOTP 状態取得 API（GET /api/auth/totp/status）** の仕様を定義する。

## 1. 概要

一次ログインで発行された **challengeId（LoginChallenge.id）** を受け取り、  
ユーザーが保持している **残リカバリコード数** を返却する API。

- Cookie 認証は不要
- challengeId が無効（存在しない / 使用済み / 期限切れ）の場合は 404
- TOTP 未完了状態での利用を前提とする

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| GET | /api/auth/totp/status |

## 3. 入力

### 3.1 クエリパラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| challengeId | 必須 | 一次ログインで発行された LoginChallenge.id |

例:  
`/api/auth/totp/status?challengeId=abc123`

## 4. 出力（レスポンス）

### 4.1 成功（200 OK）

```json
{
  "ok": true,
  "recoveryRemain": 5
}
```

- recoveryRemain
  - 利用可能なリカバリコードの残数
  - recoveryCodes が未設定の場合は 0

### 4.2 失敗

| 状態 | ステータス | Body 例 |
|------|-----------|---------|
| challengeId 未指定 | 400 | ```json { "ok": false, "error": "bad_request" } ``` |
| challengeId 不明 / 使用済み / 期限切れ | 404 | ```json { "ok": false, "error": "not_found" } ``` |
| 内部エラー | 500 | （ボディなし） |

## 5. ステータスコード一覧

| 状態 | ステータス |
|------|-----------|
| 正常 | 200 |
| パラメータ不正 | 400 |
| チャレンジ不正 | 404 |
| 内部エラー | 500 |

## 6. 挙動仕様

1. クエリから challengeId を取得
   - 未指定の場合は 400
2. LoginChallenge を取得
   - 存在しない / used = true / expiresAt < now の場合は 404
3. challengeId に紐づくユーザーを取得
4. User.recoveryCodes を配列として解釈
   - 配列でない場合は空配列扱い
5. 200 OK + { ok: true, recoveryRemain } を返却

## 7. セキュリティ・設計上の注意

- 本 API は **ログイン完了前専用**
- challengeId は **情報漏洩防止のため 404 を返す**
- ユーザー存在有無を直接返さない
- Cookie / セッションには依存しない

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 状態取得（GET /api/auth/totp/status）
