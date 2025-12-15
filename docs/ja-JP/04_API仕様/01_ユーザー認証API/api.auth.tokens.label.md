[目次](../../目次.md) > API仕様 > ユーザー認証API > トークンラベル更新（POST /api/auth/tokens/label）

# トークンラベル更新（POST /api/auth/tokens/label）

本書は、トークンラベル更新 API（POST /api/auth/tokens/label）の正式な仕様を定義する。  
※現時点の実装（apps/web/src/app/api/auth/tokens/label/route.ts）を正とする。

## 1. 概要

指定トークン（SyncToken）の label を更新する。

- 要ログイン
- 対象トークンは、リクエストボディの token か Cookie から取得する（実装依存）
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
| token | string | △ | 対象トークン（平文）。未指定の場合は Cookie から取得を試みる |
| label | string | ✅ | 新しいラベル（空文字は許容される。※現行実装は文字列チェックのみ） |

### 3.4 token の解決（実装仕様）

- body.token が string の場合、それを使用する
- そうでない場合、Cookie 名 **hk_token** の値を使用する  
  ※ログイン系が sid を使っている場合でも、このエンドポイントは現行実装では hk_token を参照する

## 4. レスポンス

### 4.1 成功（200）

```json
{ "ok": true }
```

### 4.2 失敗

#### 400 Bad Request（Content-Type 不正 / JSON不正 / label 不正 / token 解決不可）

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
