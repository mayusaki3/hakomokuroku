[目次](../../目次.md) > API仕様 > ユーザー認証API > トークンラベル更新（POST /api/auth/tokens/label）

# トークンラベル更新（POST /api/auth/tokens/label）

本書は、トークンラベル更新 API（POST /api/auth/tokens/label）の正式な仕様を定義する。  

## 1. 概要

指定トークン（SyncToken）の label を更新する。

- 要ログイン
- 対象トークンは リクエストボディで明示的に指定する
- token が指定されていない場合は 400 Bad Request を返す
- 更新対象が見つからない場合は 404

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/tokens/label |

## 3. リクエスト

### 3.1 認可

- 要ログイン（requireUserId）

### 3.2 ヘッダー

- Content-Type: application/json（必須）

### 3.3 ボディ（JSON）

```json
{
  "token": "plain-token-optional",
  "label": "my device"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---:|---|
| token | string | ✅ | 対象トークン（平文） |
| label | string | ✅ | 新しいラベル（空文字の許容可否は現行仕様を踏襲する） |
※ token は必須とし、Cookie からの補完は行わない。

### 3.4 token の扱い
- token はリクエストボディで必ず指定する
- Cookie から token を解決する処理は行わない

## 4. レスポンス

### 4.1 成功（200）

```json
{ "ok": true }
```

### 4.2 失敗

#### 400 Bad Request（Content-Type 不正 / JSON不正 / label 不正 / token 不正）

```json
{ "error": "bad_request" }
```

#### 404 Not Found（対象トークンなし）

```json
{ "error": "not_found" }
```

#### 401 Unauthorized（未ログイン）

- 既定エラー応答

#### 500 Internal Server Error

- prisma 例外など（既定エラー応答）

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > トークンラベル更新（POST /api/auth/tokens/label）
