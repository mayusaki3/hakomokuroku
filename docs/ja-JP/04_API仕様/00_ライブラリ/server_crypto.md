[目次](../../目次.md) > API仕様 > ライブラリ > server/crypto サーバー暗号ユーティリティ仕様

本書は `apps/web/src/server/crypto.ts` の仕様を定義する。

---

## 1. 目的

`server/crypto.ts` は、サーバー側で共通利用する暗号・ハッシュ関連ユーティリティを提供する。

目的は以下：

- 発行時と照合時のハッシュ表現の不一致を防ぐ（hex 表現で統一）
- Cookie 等に格納する「生トークン」を生成する際、URL セーフな文字列を得る
- デバッグ用途として、生入力から hex / base64url の両表現を得る

---

## 2. 提供関数

### 2.1 sha256hex(input)

任意文字列を SHA-256 でハッシュし、hex（小文字）で返す。

- 入力: `input: string`
- 出力: `string`（64 文字の小文字 hex）

用途例：

- SyncToken の tokenHash の生成
- recoveryCodes（推奨：ハッシュ保存）の生成

---

### 2.2 randomUrlSafe(len)

URL セーフな乱数文字列を返す（Cookie にそのまま入れる「生トークン」用）。

- 入力: `len: number`
- 出力: `string`（base64url 互換の文字列）
- 文字集合: `A-Z a-z 0-9 - _`
- 含まれない文字: `+ / =`

注意：

- 返却文字列の長さは `len` と一致しない（内部で `randomBytes(len)` を base64url に変換するため）
- `len=0` の場合、空文字列が返り得る（許容）

---

### 2.3 bothHashes(input)

デバッグ用途として、入力から SHA-256 の hex と base64url の両方を得る。

- 入力: `input: string`
- 出力: `{ hex: string, b64url: string }`
  - `hex`: `sha256hex(input)` と同一
  - `b64url`: SHA-256 digest を base64 → base64url（`+`→`-`, `/`→`_`, `=`除去）に変換したもの

---

## 3. 依存関係

- Node 標準の `crypto`（`node:crypto`）のみを使用する
- 外部サービスや DB への依存は持たない（純ユーティリティ）

---

## 4. エラー・例外方針

- 入力型は TypeScript の型で担保する（ランタイムの入力検証は行わない）
- Node の `crypto` 呼び出しが例外を投げた場合は、そのまま上位に伝播する

---
[目次](../../目次.md) > API仕様 > ライブラリ > server/crypto サーバー暗号ユーティリティ仕様
