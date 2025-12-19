[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）

# ログイン2段階認証（POST /api/auth/login/totp）

## 1. 概要
`/api/auth/login` による ID/パスワード認証後、  
**TOTP が有効なユーザーに対して 2 段階目の認証を行い、ログインを完了させる API**。

- 前段の `/api/auth/login` により **LoginChallenge（challengeId）が発行済み** であることを前提とする
- 本 API は **challengeId 単位で認証を完了** させる
- 検証方法は以下のいずれか
  - TOTP 6 桁コード
  - リカバリコード（1 回限り使用可能）
- 認証成功時のみ
  - LoginChallenge を **使用済みに更新**
  - ログイン用トークンを発行し、ログインを完了させる

## 2. エンドポイント
- Method: POST
- Path: `/api/auth/login/totp`

## 3. 認可・前提条件
- Cookie 認証は不要
- **challengeId（LoginChallenge.id）が有効であることが必須**
  - 失効済み
  - 使用済み
  - 有効期限切れ  
  上記いずれかの場合は認証不可

## 4. リクエスト

### 4.1 ヘッダー
- Content-Type: `application/json`（必須）

### 4.2 ボディ
```json
{
  "challengeId": "xxxxxxxx",
  "code": "123456",
  "recoveryCode": "ABCD1234"
}
```

#### パラメータ仕様
- challengeId（必須）
  - `/api/auth/login` で発行された LoginChallenge.id
- code（任意）
  - TOTP 6 桁コード（数字）
- recoveryCode（任意）
  - リカバリコード（平文）
- **code または recoveryCode のいずれか 1 つ以上が必須**

## 5. 処理概要
1. Content-Type を検証（JSON 必須）
2. challengeId の存在・未使用・未失効を検証
3. challengeId に紐づくユーザーを取得
4. ユーザーの TOTP 有効状態を確認
5. レート制限判定（ユーザー × IP）
6. 以下の順で検証
   1. TOTP 6 桁コード
   2. リカバリコード（未成功時のみ）
7. 成功時のみ
   - LoginChallenge を使用済みに更新
   - ログイン用トークンを発行
   - 最終ログイン日時を更新

## 6. レスポンス

### 6.1 正常（200 OK）
```json
{
  "token": "xxxxxxxx",
  "expiresAt": "2026-03-01T00:00:00.000Z"
}
```

- token
  - ログイン後に使用するアクセストークン
- expiresAt
  - トークン有効期限（ISO-8601）

※ レスポンスと同時に Cookie にトークンが設定される

---

### 6.2 異常系

#### 400 Bad Request
- Content-Type 不正
- challengeId 未指定
- code / recoveryCode 未指定
- 入力形式不正
- challenge が失効・使用済み
- 認証コード不一致

```json
{ "error": "bad_request" }
```
```json
{ "error": "expired" }
```
```json
{ "error": "invalid" }
```

#### 404 Not Found
- challengeId が存在しない

```json
{ "error": "not_found" }
```

#### 409 Conflict
- ユーザーが TOTP 未有効（totpEnabled=false）

```json
{ "error": "not_enabled" }
```

#### 429 Too Many Requests
- 短時間での連続失敗（レート制限）

```json
{ "error": "too_many_attempts" }
```

#### 500 Internal Server Error
- 予期しないサーバーエラー

```json
{ "error": "server_error" }
```

## 7. DB 更新仕様

### 7.1 認証成功時
- LoginChallenge.used = true
- SyncToken 発行
- User.lastLoginAt 更新
- リカバリコード使用時
  - 該当コードを `User.recoveryCodes` から削除

### 7.2 認証失敗時
- 失敗カウントを内部的に記録（実装依存）
- レート制限判定に利用

---

## 8. セキュリティ・設計上の注意
- challengeId は **1 回限り有効**
- TOTP / リカバリコード両方とも失敗した場合のみ `invalid`
- リカバリコードは **必ず 1 回使用で失効**
- レスポンスは認証失敗理由を最小限に留める

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > ログイン2段階認証（POST /api/auth/login/totp）
