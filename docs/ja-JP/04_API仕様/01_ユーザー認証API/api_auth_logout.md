[目次](../../目次.md) > API仕様 > ユーザー認証API > ログアウト（POST /api/auth/logout）

# ログアウト（POST /api/auth/logout）

本書は、ログアウト API（POST /api/auth/logout）の正式な仕様を定義する。

## 1. 概要

ログイン中のユーザーのセッション cookie（sid）を無効化する。
本 API は idempotent（何度実行しても結果が変わらない）である。

- 認証不要（既にセッションが無い可能性があるため）
- 常に `{ ok: true }` を返す
- 内部例外を返却しない（Next.js の仕様上 throw が起きた場合はフレームワーク内部処理に委ねる）

## 2. エンドポイント

| メソッド | パス |
|---------|------|
| POST | /api/auth/logout |

## 3. 入力

なし。

## 4. 出力（レスポンス）

### 4.1 成功（常に 200）

```json
{ "ok": true }
```

### 4.2 Cookie の無効化

レスポンスには sid Cookie を無効化する `Set-Cookie` が含まれる。

例：

```txt
Set-Cookie: sid=deleted; Path=/; HttpOnly; SameSite=Lax; Max-Age=0
```

## 5. ステータスコード

| 状態 | ステータス | 説明 |
|------|-----------|------|
| 正常終了 | 200 | 常に 200（idempotent） |

## 6. 挙動仕様

### 6.1 正常ケース
- sid Cookie を Max-Age=0 で破棄する
- セッションが存在しなくても成功扱い
- レスポンスは `{ ok: true }`

### 6.2 エラーケース
- API は内部例外を JSON として返さない
- 仕様上、エラーレスポンスは定義しない

## 7. 例外ケース一覧

本 API はアプリケーションレベルのエラー JSON を返さないため、例外ケース定義は削除。

---
[目次](../../目次.md) > API仕様 > ユーザー認証API > ログアウト（POST /api/auth/logout）
