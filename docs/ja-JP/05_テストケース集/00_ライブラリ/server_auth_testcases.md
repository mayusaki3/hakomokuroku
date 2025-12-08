[目次](../../目次.md) > テストケース集 > ライブラリ > server/auth テストケース

# server/auth テストケース

## 1. 概要

本ドキュメントは、`server/auth.ts` に実装されている認証関連関数の単体テスト仕様を示す。  
対応する実装およびテストコードは以下の通り。

- 対象実装: apps/web/src/server/auth.ts  
- 対応テスト: apps/web/tests/server.auth.spec.ts  

server/auth.ts は、主に以下の責務を持つ。

- セッション取得（readSession）
- ユーザーID必須チェック（requireUserId）
- 認証情報の解決および返却

本テストケースでは、正常系・異常系の分岐を網羅し、Branch / Statement / Function / Line の各カバレッジ 100% を達成することを目的とする。

---

## 2. テスト対象

- モジュール: server/auth.ts
- 主な公開関数:
  - readSession
  - requireUserId

観点:

1. 正常時の戻り値
2. セッション未存在時の分岐
3. 内部例外発生時の分岐
4. requireUserId による例外送出条件

---

## 3. 前提条件 / 共通設定

- テストランナー: Vitest
- モック対象:
  - 認証クライアント・Cookie・Header 取得処理など、外部依存はすべてモックする。
- テストは純粋な unit test とし、HTTP レスポンスや Next.js の Route Handler は対象外とする。

---

## 4. テストケース一覧

| No | テストID              | 対象関数        | テスト名                                         | 観点 |
|----|-----------------------|-----------------|--------------------------------------------------|------|
| 1  | AUTH-SERVER-TC-01     | readSession     | 有効なセッションが存在する場合                   | 正常系 |
| 2  | AUTH-SERVER-TC-02     | readSession     | セッションが存在しない場合                       | 分岐 |
| 3  | AUTH-SERVER-TC-03     | readSession     | 内部処理で例外が発生した場合                     | 例外 |
| 4  | AUTH-SERVER-TC-04     | requireUserId   | ログイン済みユーザーから userId を取得           | 正常系 |
| 5  | AUTH-SERVER-TC-05     | requireUserId   | 未ログイン時は例外を送出                         | 分岐 |

---

## 5. テストケース詳細

### 5.1 AUTH-SERVER-TC-01  
**readSession: 有効なセッションが存在する場合**

- 種別: 単体テスト
- 観点:
  - セッション情報が正しく解決されること
  - 戻り値に user オブジェクトが含まれること

#### 前提条件
- 内部のセッション取得関数が、user 情報を含むオブジェクトを返すようモックされている。

#### 入力
- readSession() を呼び出す

#### 期待結果
1. 例外が発生しない
2. 戻り値が `{ user: { id: "U1", ... } }` の形式である
3. user が null ではない

---

### 5.2 AUTH-SERVER-TC-02  
**readSession: セッションが存在しない場合**

- 種別: 単体テスト
- 観点:
  - 未ログイン時の分岐確認

#### 前提条件
- セッション取得処理が null を返すようにモックされている

#### 入力
- readSession()

#### 期待結果
1. 例外は発生しない
2. 戻り値が `{ user: null }` を含む
3. 認証エラーは投げられない（API 側で判定する前提）

---

### 5.3 AUTH-SERVER-TC-03  
**readSession: 内部処理で例外が発生した場合**

- 種別: 単体テスト
- 観点:
  - catch 節が実行される分岐の網羅

#### 前提条件
- セッション取得処理が例外を throw するようにモックされている

#### 入力
- readSession()

#### 期待結果
1. 例外は外に伝播しない（実装準拠）
2. 戻り値は `{ user: null }`
3. エラーログ出力が行われる（ログ内容自体は検証対象外）

---

### 5.4 AUTH-SERVER-TC-04  
**requireUserId: ログイン済みユーザーから userId を取得**

- 種別: 単体テスト
- 観点:
  - readSession の正常系と連携した動作確認

#### 前提条件
- readSession が `{ user: { id: "U1" } }` を返すようモックされている

#### 入力
- requireUserId()

#### 期待結果
1. 戻り値として `"U1"` が返る
2. 例外は発生しない

---

### 5.5 AUTH-SERVER-TC-05  
**requireUserId: 未ログイン時は例外を送出**

- 種別: 単体テスト
- 観点:
  - 認証必須分岐の保証
  - Branch カバレッジ 100% 達成対象

#### 前提条件
- readSession が `{ user: null }` を返すようモックされている

#### 入力
- requireUserId()

#### 期待結果
1. 例外が送出される
2. 例外メッセージが認証エラー相当である
3. userId は返らない

---

## 6. 備考

- 本ドキュメントは `tests/server.auth.spec.ts` と 1 対 1 で対応する。
- API Route 側（/api/auth/*）のテストとは責務を分離し、server/auth は純粋なロジック単体として検証する。
- 本テストにより、server/auth.ts は Branch / Statement / Function / Line すべて 100% カバレッジとなる。

---
[目次](../../目次.md) > テストケース集 > ライブラリ > server/auth テストケース
