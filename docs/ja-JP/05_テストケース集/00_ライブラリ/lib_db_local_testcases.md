[目次](../../目次.md) > テストケース集 > ライブラリ > lib/db ローカルDBラッパー

# テストケース：lib/db ローカルDBラッパー

本ドキュメントは `src/lib/db.ts`（ローカル Dexie ラッパー）の単体テスト仕様である。  
テスト番号は **LIB_DB_LOCAL-TC-01〜LIB_DB_LOCAL-17** を付与する。

---

## LIB_DB_LOCAL-TC-01: ensureUnassignedBox で仮置き箱を作成できる
### 目的  
`UNASSIGNED`（仮置き箱）が存在しない場合、新規作成されることを確認する。

### 前提
- DB 初期化 (`__hkdbReset`) 直後。

### 手順
1. `ensureUnassignedBox()` を実行。

### 期待結果
- `boxes` テーブルに `id="UNASSIGNED"` のレコードが1件作成される。
- 戻り値は特に利用しない（副作用として仮置き箱が存在することを保証する）。

---

## LIB_DB_LOCAL-TC-02: ensureUnassignedBox は idempotent
### 目的  
複数回呼び出しても重複作成されないことを確認する。

### 手順
1. `ensureUnassignedBox()` を 2 回連続で実行。

### 期待結果
- レコードが 1 件のみである（重複作成しない）。
- 両呼び出し結果で同一 ID を返す。

---

## LIB_DB_LOCAL-TC-03: getBox は boxes.get の結果を返す
### 目的  
Box ID を指定した場合に正しいレコードを返すことを確認する。

### 手順
1. 事前に Box を 1 件 insert。
2. `getBox(id)` を実行。

### 期待結果
- 挿入した Box オブジェクトそのものが返る。

---

## LIB_DB_LOCAL-TC-04: removeBox(UNASSIGNED) は例外
### 目的  
仮置き箱は削除できないことを保証する。

### 手順
1. `removeBox("UNASSIGNED")` を実行。

### 期待結果
- 例外が throw される。

---

## LIB_DB_LOCAL-TC-05: removeBox は items を仮置き箱に移動し box を削除
### 目的  
箱削除時に所属アイテムが仮置き箱へ移動されることを確認する。

### 前提
- 削除対象 Box に items が存在する。

### 手順
1. items を含む Box を用意。
2. `removeBox(targetBoxId)` を実行。

### 期待結果
- 対象 Box の items が `UNASSIGNED` に移動。
- 対象 Box は削除される。

---

## LIB_DB_LOCAL-TC-06: findBoxByCodeOrId 空文字/undefined/null なら null
### 目的  
不正な検索キーの場合、null を返す。

### 手順
- `findBoxByCodeOrId("")`
- `findBoxByCodeOrId(null)`
- `findBoxByCodeOrId(undefined)`

### 期待結果
- すべて `null` を返す。

---

## LIB_DB_LOCAL-TC-07: findBoxByCodeOrId は id 直指定でヒット
### 目的  
直接 ID 指定で Box が取得できることを確認。

### 前提
- 事前に Box を insert。

### 手順
1. `findBoxByCodeOrId(id)` 実行。

### 期待結果
- 該当 Box を返す。

---

## LIB_DB_LOCAL-TC-08: findBoxByCodeOrId は code でもヒット
### 目的  
code 列による検索が可能であることを確認。

### 前提
- code を持つ Box を insert。

### 手順
1. `findBoxByCodeOrId(code)` を実行。

### 期待結果
- 該当 Box を返す。

---

## LIB_DB_LOCAL-TC-09: findBoxByCodeOrId は見つからない場合 null
### 目的  
検索結果がない場合 null を返す。

### 手順
- 存在しない id / code を渡す。

### 期待結果
- `null` を返す。

---

## LIB_DB_LOCAL-TC-10: moveItem invalid args は例外
### 目的  
不正な引数で例外が発生するかを確認。

### 手順
- `moveItem("", "x")`
- `moveItem(null, "x")`
- `moveItem("item", "")`

### 期待結果
- いずれも例外を throw。

---

## LIB_DB_LOCAL-TC-11: moveItem は移動先箱が無ければ例外
### 手順
- 存在しない boxId を指定して moveItem。

### 期待結果
- 例外 throw。

---

## LIB_DB_LOCAL-TC-12: moveItem は item 無しなら例外
### 手順
- 存在しない itemId を指定して moveItem。

### 期待結果
- 例外 throw。

---

## LIB_DB_LOCAL-TC-13: moveItem は同じ boxId なら no-op
### 目的  
同じ boxId の場合は更新されない。

### 手順
1. 既存 item を同じ boxId へ moveItem。

### 期待結果
- 変更が起きない（例外なし）。

---

## LIB_DB_LOCAL-TC-14: moveItem は別箱へ移動し updatedAt を更新
### 手順
1. item と 2 つの box を用意。
2. `moveItem(itemId, toBoxId)` を実行。

### 期待結果
- item の `boxId` が更新される。
- `updatedAt` が増加している。

---

## LIB_DB_LOCAL-TC-15: moveItems は itemIds 空なら 0
### 手順
- `moveItems([], toBoxId)` を実行。

### 期待結果
- `0` を返す。

---

## LIB_DB_LOCAL-TC-16: moveItems は移動先箱が無ければ例外
### 手順
- 存在しない toBoxId を指定。

### 期待結果
- 例外 throw。

---

## LIB_DB_LOCAL-TC-17: moveItems は複数アイテムを正常移動し count を返す
### 手順
1. items を複数 insert。
2. `moveItems([id1,id2], validBoxId)` 実行。

### 期待結果
- item がすべて指定 box へ移動する。
- 戻り値は移動した件数（例: 2）。

---
[目次](../../目次.md) > テストケース集 > ライブラリ > lib/db ローカルDBラッパー
