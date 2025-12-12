[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン（TOTP 2段階目：POST /api/auth/login/totp）

# ログイン（TOTP 2 段階目：POST /api/auth/login/totp）

本書は、一次ログイン後の 2 段階目（TOTP / Recovery Code）でログインを完了する API 仕様を定義する。

## 1. 概要

- loginId（一次ログインのチャレンジ ID）を受け取る
- TOTP またはリカバリコードで検証
- 成功したら sid Cookie を発行し、200 + token / expiresAt を返す

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/login/totp |

## 3. 入力

### 3.1 ボディ

```json
{
  "loginId": "xxxxxx",
  "code": "123456",
  "recoveryCode": null
}
```

### 3.2 ヘッダ

| 項目 | 必須 | 値 |
|------|------|------|
| Content-Type | 必須 | application/json |

## 4. 出力

### 4.1 成功

```json
{
  "token": "xxxxx",
  "expiresAt": "2025-12-31T23:59:59.000Z"
}
```

Set-Cookie:

```txt
sid={セッションID}; Path=/; HttpOnly; SameSite=Lax; ...
```

### 4.2 失敗

| 状態 | ステータス | Body 例 |
|------|-----------|---------|
| フィールド不足 | 400 | { "error": "invalid_request" } |
| loginId 不明 | 404 | { "error": "login_challenge_not_found" } |
| TOTP 未有効 | 400 | { "error": "totp_not_enabled" } |
| コード不一致 | 401 | { "error": "invalid_code" } |
| 試行回数超過 | 429 | { "error": "too_many_attempts" } |
| 内部エラー | 500 | { "error": "internal_error" } |

## 5. ステータスコード

| 状態 | ステータス |
|------|-----------|
| 正常 | 200 |
| 入力エラー | 400 |
| 認証エラー | 401 |
| チャレンジ不明 | 404 |
| レートリミット | 429 |
| 内部エラー | 500 |

## 6. 挙動仕様

1. loginId / code / recoveryCode を取得。loginId 無し → 400。
2. チャレンジ検索。無ければ 404。
3. ユーザーが TOTP 有効か確認。無効なら 400。
4. TOTP or recoveryCode を検証。不一致なら 401。
5. セッション ID（sid）を発行し Cookie 付与。
6. token / expiresAt を返す。
7. loginId は使用済みにして再利用不可。

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン（TOTP 2段階目：POST /api/auth/login/totp）
