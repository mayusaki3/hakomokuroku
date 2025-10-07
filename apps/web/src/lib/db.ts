// apps/web/src/lib/db.ts
import Dexie, { Table } from 'dexie';

/** 箱 */
export interface Box {
  id: string;
  code: string;
  name: string;
  location?: string | null;
  tags?: any;                 // JSON（string[] 想定）。null/undefined 許容
  thumbs?: string[];          // 箱サムネ（dataURL等）
  createdAt: string;          // ISO
  updatedAt: string;          // ISO
}

/** アイテム（1箱に複数） */
export interface Item {
  id: string;
  boxId: string;
  name: string;
  tags?: any;                 // JSON（string[] 想定）
  note?: string | null;
  thumbs?: string[];          // アイテムサムネ
  createdAt: string;
  updatedAt: string;
}

/** 置き場所（1箱に1つ） */
export interface BoxLocation {
  id: string;
  boxId: string;              // 1:1 用に unique 運用
  thumbs?: string[];          // 置き場所サムネ（dataURL等）
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

class HKDB extends Dexie {
  boxes!: Table<Box, string>;
  items!: Table<Item, string>;
  boxLocations!: Table<BoxLocation, string>;

  constructor() {
    super('hakomokuroku');

    // 既存の version(N) から +1 してください（例: 3 → 4）
    this.version(5).stores({
      // 既存のインデックスは維持。thumbs は索引不要。
      boxes: 'id, code, updatedAt',
      items: 'id, boxId, updatedAt',
      boxLocations: 'id, boxId, updatedAt',
    })
    .upgrade(async (tx) => {
      // 既存レコードの thumbs 未定義を [] に補完（将来のUIロジックを簡単に）
      await tx.table('boxes').toCollection().modify((b: any) => {
        if (b.thumbs === undefined) b.thumbs = [];
      });
      await tx.table('items').toCollection().modify((it: any) => {
        if (it.thumbs === undefined) it.thumbs = [];
      });
      // boxLocations は新設なので特に無し
    });

    // 既存のバージョンが違う場合は、必要に応じて this.version(3) ... を残してください。
  }
}

export const db = new HKDB();
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') (window as any).__hkdb = db;
