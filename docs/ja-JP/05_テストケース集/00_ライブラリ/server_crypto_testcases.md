[目次](../../目次.md) > テストケース集 > ライブラリ > server/crypto サーバー暗号ユーティリティ

# テストケース：server/crypto サーバー暗号ユーティリティ

本書は `apps/web/src/server/crypto.ts` の単体テストケースを定義する。  
テストは純ユーティリティの性質に合わせ、**既知値の一致**と**出力形式**を中心に検証する。  
乱数品質そのもの（統計的性質）はテストしない。

---

## 1. 前提

- テスト対象: `apps/web/src/server/crypto.ts`
- テスト配置（例）: `apps/web/tests/server.crypto.spec.ts`
- 依存: Node 標準 `crypto` のみ
- 期待:
  - `sha256hex` は既知値に一致
  - `randomUrlSafe` は URL セーフ形式
  - `bothHashes` は `sha256hex` と整合し、b64url 変換も正しい

---

## 2. テストケース一覧

- SERVER_CRYPTO-TC-01: sha256hex は既知入力に対して期待通りの hex を返す
- SERVER_CRYPTO-TC-02: sha256hex は常に小文字 hex(64桁) を返す
- SERVER_CRYPTO-TC-03: randomUrlSafe は URL-safe のみで構成され、"+" "/" "=" を含まない
- SERVER_CRYPTO-TC-04: randomUrlSafe(len=0) は例外なく文字列を返す（空文字可）
- SERVER_CRYPTO-TC-05: bothHashes は sha256hex と整合し、b64url 変換も期待通り

---

## 3. テストケース詳細

### SERVER_CRYPTO-TC-01: sha256hex は既知入力に対して期待通りの hex を返す

- 入力:
  - `sha256hex("abc")`
  - `sha256hex("")`
- 期待:
  - `"abc"` は既知の SHA-256 hex に一致
  - `""` は既知の SHA-256 hex に一致

---

### SERVER_CRYPTO-TC-02: sha256hex は常に小文字 hex(64桁) を返す

- 入力:
  - `sha256hex("Hello")`
- 期待:
  - `/^[0-9a-f]{64}$/` にマッチ

---

### SERVER_CRYPTO-TC-03: randomUrlSafe は URL-safe のみで構成され、"+" "/" "=" を含まない

- 入力:
  - `randomUrlSafe(32)`
- 期待:
  - `/^[A-Za-z0-9\-_]+$/` にマッチ
  - `"+" "/" "="` を含まない

---

### SERVER_CRYPTO-TC-04: randomUrlSafe(len=0) は例外なく文字列を返す（空文字可）

- 入力:
  - `randomUrlSafe(0)`
- 期待:
  - 例外が発生しない
  - 返却値が `string`
  - `/^[A-Za-z0-9\-_]*$/` にマッチ（空文字を許容）

---

### SERVER_CRYPTO-TC-05: bothHashes は sha256hex と整合し、b64url 変換も期待通り

- 入力:
  - `bothHashes("test-token")`
- 手順:
  - `got.hex` と `sha256hex("test-token")` を比較
  - Node の `crypto` で digest を求め、base64→base64url 変換した期待値を作り `got.b64url` と比較
- 期待:
  - `got.hex === sha256hex(input)`
  - `got.hex` は `/^[0-9a-f]{64}$/`
  - `got.b64url` は `/^[A-Za-z0-9\-_]+$/`
  - `got.b64url` が期待する base64url 文字列と一致

---
[目次](../../目次.md) > テストケース集 > ライブラリ > server/crypto サーバー暗号ユーティリティ
