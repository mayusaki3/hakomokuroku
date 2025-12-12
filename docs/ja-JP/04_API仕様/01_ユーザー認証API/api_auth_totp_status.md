[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 状態取得（GET /api/auth/totp/status）

# TOTP 状態取得（GET /api/auth/totp/status）

本書は、ログイン途中で使用する「TOTP 状態取得 API」（GET /api/auth/totp/status）の仕様を定義する。

## 1. 概要

一次ログインで発行された loginId を受け取り、ユーザーの残リカバリコード数を返す。

- sid Cookie は不要
- loginId 不正なら 404

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| GET | /api/auth/totp/status |

## 3. 入力

### 3.1 クエリパラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| loginId | 必須 | 一次ログインのログインチャレンジ ID |

例:  
`/api/auth/totp/status?loginId=abc123`

## 4. 出力（レスポンス）

### 4.1 成功

```json
{
  "recoveryRemain": 5
}
```

### 4.2 失敗

| 状態 | ステータス | Body 例 |
|------|-----------|---------|
| loginId 未指定 | 400 | { "error": "missing_loginId" } |
| loginId 不明 | 404 | { "error": "login_challenge_not_found" } |
| 内部エラー | 500 | { "error": "internal_error" } |

## 5. ステータスコード

| 状態 | ステータス |
|------|-----------|
| 正常 | 200 |
| パラメータ不足 | 400 |
| チャレンジ不明 | 404 |
| 内部エラー | 500 |

## 6. 挙動仕様

1. loginId を取得。なければ 400。
2. チャレンジを検索。なければ 404。
3. ユーザーの残リカバリコード数を取得。
4. 200 + { recoveryRemain } を返却。

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > TOTP 状態取得（GET /api/auth/totp/status）
