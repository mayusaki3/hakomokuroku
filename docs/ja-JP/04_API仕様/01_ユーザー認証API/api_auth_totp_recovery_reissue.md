[目次](../../目次.md) > API仕様 > ユーザー認証API > リカバリコード再発行（POST /api/auth/totp/recovery/reissue）

# リカバリコード再発行（POST /api/auth/totp/recovery/reissue）

## 1. 概要

TOTP を **有効化済み**のユーザーに対して、  
リカバリコードを **再発行**する API。

- 再発行を行うと **既存のリカバリコードはすべて失効**する
- 新しいリカバリコードは **10 個**生成される
- リカバリコードは **このレスポンスでのみ平文返却**される
- DB には **平文保存しない**
  - `User.recoveryCodes` には検証可能形式（例：ハッシュ）で保存する
- 本 API の実行には **TOTP による本人確認**が必須

本 API は、  
「リカバリコードを紛失した」「残数が少なくなった」  
といったケースを想定している。

---

## 2. エンドポイント

| 項目 | 内容 |
|----|----|
| Method | POST |
| Path | /api/auth/totp/recovery/reissue |

---

## 3. 認可・前提条件

- 要ログイン（Cookie `sid` によるセッション認証）
- TOTP が **有効化済み**であること
- Content-Type: application/json（必須）

※ Authorization: Bearer は使用しない  
※ 認証方式は Cookie `sid` に統一する

---

## 4. リクエスト

### 4.1 ヘッダー

| 項目 | 必須 | 説明 |
|----|----|----|
| Content-Type | 必須 | application/json |
| Cookie | 必須 | sid={セッションID} |

### 4.2 ボディ

```json
{
  "code": "123456"
}
```

- code（必須）
  - TOTP 認証アプリが生成した **6 桁数字の文字列**
  - 形式不正・未指定はエラー

---

## 5. レスポンス

### 5.1 正常（200 OK）

```json
{
  "ok": true,
  "recoveryCodes": [
    "ABCD-1234",
    "EFGH-5678"
  ]
}
```

- recoveryCodes
  - 新規発行された **10 個**のリカバリコード
  - **このレスポンスでのみ返却**
  - サーバー側から再表示・再取得は不可

---

### 5.2 異常系

#### 400 Bad Request（invalid_request）

- Content-Type 不正
- JSON 不正
- code 未指定 / 空 / 形式不正（6桁数字でない）

```json
{
  "ok": false,
  "error": "invalid_request"
}
```

---

#### 401 Unauthorized（unauthorized）

- 未ログイン
- セッション無効

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

---

#### 409 Conflict（conflict）

- TOTP 未有効（`User.totpEnabled = false`）
- TOTP 設定未完了状態（pending のみ存在する等）

```json
{
  "ok": false,
  "error": "conflict"
}
```

※ 状態が原因で処理できないことを示す  
※ 認証失敗ではない

---

#### 400 Bad Request（auth_failed）

- TOTP コード検証失敗
  - 不一致
  - 有効期限切れ

```json
{
  "ok": false,
  "error": "auth_failed"
}
```

**重要**

- 認証失敗理由の詳細は返さない
- 正しい / 誤り を推測させないため、常に同一レスポンスとする

---

#### 404 Not Found（not_found）

- ログインユーザーが存在しない（原則想定外）

```json
{
  "ok": false,
  "error": "not_found"
}
```

---

#### 500 Internal Server Error（internal_error）

- 予期しない例外
- DB / 暗号化処理エラー等

（ボディなし、または共通エラー応答）

---

## 6. DB 更新仕様

### 成功時

- `User.recoveryCodes`
  - 新規 10 件を生成し保存
  - **既存の recoveryCodes はすべて失効**
- `User.updatedAt`
  - 必要に応じて更新

### 失敗時

- DB 状態は変更しない
- 認証失敗時の失敗回数管理は実装依存

---

## 7. 処理フロー（概要）

1. Content-Type を検証
2. Cookie `sid` によりログインユーザーを特定
3. ユーザー取得
4. TOTP 有効状態を確認
   - 未有効 / 未完了 → conflict
5. TOTP コード検証
   - 不一致 → auth_failed
6. 新しいリカバリコードを生成
7. 旧コードを全失効
8. 200 OK + 新コードを返却

---

## 8. セキュリティ・設計上の注意

- リカバリコードは **平文返却 1 回限り**
- 再発行は **本人確認（TOTP）必須**
- 再発行により **既存コードは即時無効化**
- brute-force 対策は `totpFailCount` 等で制御可能（実装依存）

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > リカバリコード再発行（POST /api/auth/totp/recovery/reissue）
