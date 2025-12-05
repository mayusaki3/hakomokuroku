[目次](../../目次.md) > API仕様 > ライブラリ > lib/db ローカルDBラッパー仕様

# lib/db ローカルDBラッパー仕様

## 0. サマリ

本ドキキュメントは、フロントエンド（ブラウザ側）で使用される Dexie ベースのローカルDBラッパー `src/lib/db.ts` の仕様を定義する。

- 対象モジュール: `apps/web/src/lib/db.ts`
- 役割:
  - 箱（Box）、アイテム（Item）、箱の設置場所（BoxLocation）、タグ（Tag）のローカル永続化
  - 仮置き箱（UNASSIGNED）の存在保証
  - 箱削除時のアイテム移動
  - アイテム移動ユーティリティ（単体／複数）
  - DevConsole からのデバッグ支援（`__hkdb`, `__hkdbReset`）

本仕様は、`docs/ja-JP/05_テストケース集/00_ライブラリ/lib_db_local_testcases.md` に記載されたテストケース（LIB_DB_LOCAL-xx）の上位仕様とする。

---

## 1. 対象モジュール／公開インターフェース

### 1.1 ファイルパス

- `apps/web/src/lib/db.ts`

### 1.2 エクスポート一覧

- 型・定数  
  - `AIState`  
  - `Box`  
  - `Item`  
  - `BoxLocation`  
  - `TagKind`  
  - `Tag`  
  - `db`（Dexie インスタンス）  
  - `UNASSIGNED_BOX_ID`  
  - `UNASSIGNED_BOX_CODE`  

- 関数  
  - `getBox(id: string): Promise<Box | undefined>`  
  - `ensureUnassignedBox(): Promise<void>`  
  - `removeBox(boxId: string): Promise<void>`  
  - `findBoxByCodeOrId(key: string | null | undefined): Promise<Box | null>`  
  - `moveItem(itemId: string, targetBoxId: string): Promise<Item>`  
  - `moveItems(itemIds: string[], targetBoxId: string): Promise<number>`  

- DevConsole 支援  
  - `globalThis.__hkdb = db`  
  - `globalThis.__hkdbReset = async () => { await db.delete(); await db.open(); return 'ok'; }`

---

## 2. データモデル仕様

### 2.1 共通仕様

- すべての日時項目は ISO 8601 文字列（`new Date().toISOString()`）とする。
- `meta` / `tags` / `thumbs` は null または未定義を許容。

### 2.2 AIState

```ts
export type AIState = 'pending' | 'processing' | 'done' | 'error';
```

### 2.3 Box

```ts
export interface Box {
  id: string;
  code: string;
  name: string;
  location?: string | null;
  tags?: string[] | null;
  thumbs?: string[] | null;
  meta?: any | null;
  aiState?: AIState | null;
  aiUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 2.4 Item

```ts
export interface Item {
  id: string;
  boxId: string;
  name: string;
  tags?: string[] | null;
  note?: string | null;
  thumbs?: string[] | null;
  meta?: any | null;
  aiState?: AIState | null;
  aiUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 2.5 BoxLocation

```ts
export interface BoxLocation {
  id: string;
  boxId: string;
  thumbs?: string[] | null;
  note?: string | null;
  meta?: any | null;
  aiState?: AIState | null;
  aiUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 2.6 TagKind / Tag

```ts
export type TagKind = 'BOX' | 'ITEM' | 'SHARED';
```

```ts
export interface Tag {
  id: string;
  name: string;
  kind: TagKind;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. Dexie スキーマ仕様

### 3.1 DB 名称

- `hk-local-v1`

### 3.2 バージョンとストア

```ts
this.version(1).stores({
  boxes: 'id, code, updatedAt, aiState',
  items: 'id, boxId, updatedAt, aiState, name',
  boxLocations: 'id, boxId, updatedAt, aiState',
  tags: 'id, [name+kind], enabled',
});
```

---

## 4. グローバル定数

### 4.1 UNASSIGNED_BOX_ID / UNASSIGNED_BOX_CODE

```ts
export const UNASSIGNED_BOX_ID = 'UNASSIGNED';
export const UNASSIGNED_BOX_CODE = 'UNASSIGNED';
```

- 仮置き箱を表すための固定文字列。
- `ensureUnassignedBox` により DB 上に必ず存在する。

---

## 5. 関数仕様

---

### 5.1 getBox(id)

- `db.boxes.get(id)` の結果を返す。
- 見つからなければ `undefined`。

---

### 5.2 ensureUnassignedBox()

**A案で仕様確定（返り値は規定しない）。**

- UNASSIGNED 箱が存在しなければ生成。
- 存在する場合は何もしない（idempotent）。
- 生成時の `createdAt`・`updatedAt` は同じ時刻。

---

### 5.3 removeBox(boxId)

- `boxId === UNASSIGNED_BOX_ID` → `Error('仮置き箱は削除できません')`
- 内部で `ensureUnassignedBox()` を呼ぶ。
- トランザクション内で：
  - items の `boxId` を UNASSIGNED へ更新（updatedAt も更新）
  - boxLocations を削除
  - boxes を削除

---

### 5.4 findBoxByCodeOrId(key)

- `null/undefined/空/空白のみ` → `null`
- `id` → ヒットなら返す
- `code` → ヒットなら返す
- 見つからない → `null`

---

### 5.5 moveItem(itemId, targetBoxId)

- `!itemId || !targetBoxId` → `Error('invalid args')`
- 移動先 Box がなければ `Error('移動先の箱が存在しません')`
- アイテムがなければ `Error('アイテムが存在しません')`
- 既に同一 boxId → no-op（更新しない）
- 異なる場合 → boxId 変更 + updatedAt 更新後の Item を返す

---

### 5.6 moveItems(itemIds, targetBoxId)

- `itemIds` が空 → `0`
- 移動先 Box がなければ例外
- トランザクションで更新し、実際に移動した件数を返す

---

## 6. DevConsole ユーティリティ

### 6.1 __hkdb

- Dexie インスタンスを公開し、開発用に操作可能。

### 6.2 __hkdbReset

- DB を delete → open して再構築。
- 返り値は `'ok'`。

---

## 7. テストケースとの対応

`lib_db_local_testcases.md` の各テストは本仕様の検証を目的とする。

- 01–02: ensureUnassignedBox  
- 03: getBox  
- 04–05: removeBox  
- 06–09: findBoxByCodeOrId  
- 10–14: moveItem  
- 15–17: moveItems  

---
[目次](../../目次.md) > API仕様 > ライブラリ > lib/db ローカルDBラッパー仕様
