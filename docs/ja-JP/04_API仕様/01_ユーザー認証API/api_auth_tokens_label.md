<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260513-104000Z-ATKL
lang: ja-JP
canonical_title: トークンラベル更新（POST /api/auth/tokens/label）
document_type: spec
canonical_document: true
-->

[目次](../../目次.md) > API仕様 > ユーザー認証API > トークンラベル更新（POST /api/auth/tokens/label）

# トークンラベル更新（POST /api/auth/tokens/label）

本書は、トークンラベル更新 API（POST /api/auth/tokens/label）の正式な仕様を定義する。  
現時点の実装（apps/web/src/app/api/auth/tokens/label/route.ts）および Vitest（apps/web/tests/api.auth.tokens.label.spec.ts）を正とする。

---

## 1. 概要

指定した SyncToken の表示ラベルを更新する API。

- 要ログイン
- `Content-Type: application/json` 必須
- `token` は必須。空白のみは不可
- `label` は必須。ただし空文字・空白のみは許容する
- 更新先カラムは `deviceName`
- `token` は `tokenHash` として照合する
- 対象が見つからない場合は 404
- `updateMany` の戻り値が不正な場合は 500

---

## 2. 仕様項目

| sec_id | 項目 | 検証責務 |
|---|---|---|
| sec_auth_tokens_label_content_type | Content-Type 検証 | application/json 以外または未指定を 400 にする |
| sec_auth_tokens_label_json_parse | JSON parse | JSON parse 失敗を 400 にする |
| sec_auth_tokens_label_token_required | token 検証 | token 未指定/非string/空白のみを 400 にする |
| sec_auth_tokens_label_label_required | label 検証 | label 未指定/非string を 400 にする |
| sec_auth_tokens_label_label_empty_allowed | label 空文字許容 | label 空文字/空白のみを正常系として扱う |
| sec_auth_tokens_label_require_user | 認証要求 | requireUserId によりログインユーザーを取得する |
| sec_auth_tokens_label_auth_error | 認証エラー | status 付き/なし例外を unauthorized に変換する |
| sec_auth_tokens_label_update | ラベル更新 | userId + tokenHash 条件で deviceName を更新する |
| sec_auth_tokens_label_not_found | 対象なし | updateMany.count=0 を 404 にする |
| sec_auth_tokens_label_invalid_update_result | 不正戻り値 | updateMany の戻り値不正を 500 にする |
| sec_auth_tokens_label_internal_error | 内部エラー | DB例外を 500 にする |
| sec_auth_tokens_label_imports | 実装依存 import | @/lib/prisma と @/lib/auth/requireUserId を使用する |

---

## 3. エンドポイント

| メソッド | パス |
|---|---|
| POST | /api/auth/tokens/label |

---

## 4. 実装依存 import {#sec_auth_tokens_label_imports}

本 route は、他の token 系 API と異なり、以下を使用する。

```ts
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/auth/requireUserId';
```

テストでも同じ import path を mock 対象にする。

---

## 5. リクエスト

### 5.1 ヘッダー {#sec_auth_tokens_label_content_type}

```txt
Content-Type: application/json
```

- `application/json` を含まない場合は 400
- ヘッダー未指定の場合も 400

### 5.2 Body(JSON)

```json
{
  "token": "t1",
  "label": "My device"
}
```

| 項目 | 必須 | 条件 |
|---|---|---|
| token | 必須 | string かつ trim 後 1 文字以上 |
| label | 必須 | string。空文字・空白のみも許容 |

### 5.3 token 検証 {#sec_auth_tokens_label_token_required}

- `typeof token !== 'string'` は 400
- `token.trim().length === 0` は 400

### 5.4 label 検証 {#sec_auth_tokens_label_label_required}

- `typeof label !== 'string'` は 400
- 空文字 `''` は許容
- 空白のみ `'   '` は許容

---

## 6. レスポンス

### 6.1 正常 {#sec_auth_tokens_label_update}

```json
{
  "ok": true
}
```

- HTTP 200

### 6.2 Content-Type / JSON / 入力不正

```json
{
  "error": "bad_request"
}
```

- HTTP 400

### 6.3 未ログイン・認証エラー {#sec_auth_tokens_label_auth_error}

```json
{
  "error": "unauthorized"
}
```

- `requireUserId` 例外に `status` number がある場合はその status を使用する
- status が無い場合は 401

### 6.4 対象なし {#sec_auth_tokens_label_not_found}

- HTTP 404
- Body なし

### 6.5 内部エラー {#sec_auth_tokens_label_internal_error}

- HTTP 500
- Body なし

---

## 7. DB アクセス

### 7.1 更新 {#sec_auth_tokens_label_update}

```ts
const result = await prisma.syncToken.updateMany({
  where: { userId, tokenHash: token },
  data: { deviceName: label },
});
```

### 7.2 更新結果判定

- `result` が falsy の場合は 500
- `typeof result.count !== 'number'` の場合は 500
- `result.count === 0` の場合は 404
- `result.count > 0` の場合は 200

---

## 8. 設計上の注意

- `label` は表示名のため、空文字・空白のみを許容する現実装仕様とする
- `token` は trim 後空文字を不可とする
- 他ユーザーの tokenHash は `where.userId` により更新対象外になる
- 対象なしは body なし 404 とする

---

[目次](../../目次.md) > API仕様 > ユーザー認証API > トークンラベル更新（POST /api/auth/tokens/label）
