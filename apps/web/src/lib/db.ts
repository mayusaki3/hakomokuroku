// apps/web/src/lib/db.ts
'use client';
import Dexie, { Table } from 'dexie';

export type ISOms = number;

export interface Box {
  id: string;
  code: string;
  name: string;
  location?: string;
  tags?: string[];
  coverImageId?: string;
  createdAt: ISOms;
  updatedAt: ISOms;

  // 将来の同期用メタ（今は使わないがカラムだけ用意）
  version?: number;
  deletedAt?: ISOms | null;
  updatedAtClient?: ISOms;
  updatedAtServer?: ISOms;
  dirty?: boolean;
}

export interface Item {
  id: string;
  boxId: string;
  name: string;
  quantity?: number;
  tags?: string[];
  features?: string;
  note?: string;
  imageIds?: string[];
  createdAt: ISOms;
  updatedAt: ISOms;
}

export interface ImageRec {
  id: string;
  owner?: string;
  boxId?: string;
  itemId?: string;
  blobKey?: string;     // 将来S3キー等
  dataUrl?: string;     // MVPはDataURLでも可。最終的にはBlob保管推奨
  w: number;
  h: number;
  exif?: any;
  createdAt: ISOms;
}

class HKDB extends Dexie {
  boxes!: Table<Box, string>;
  items!: Table<Item, string>;
  images!: Table<ImageRec, string>;

  constructor() {
    super('hakomokuroku');

    // v1 → v2: tags を multiEntry 化
    this.version(1).stores({
      boxes: '&id, code, name, location, updatedAt',
      items: '&id, boxId, name, updatedAt',
      images: '&id, boxId, itemId, createdAt',
    });

    this.version(2).stores({
      boxes: '&id, code, name, location, *tags, updatedAt',
      items: '&id, boxId, name, *tags, updatedAt',
      images: '&id, boxId, itemId, createdAt',
    }).upgrade(tx => {
      // 既存データの tags 初期化など必要ならここで
      return tx.table('boxes').toCollection().modify((b: any) => {
        if (!Array.isArray(b.tags)) b.tags = [];
      });
    });
  }
}

export const db = new HKDB();

/** code の重複がないかチェック */
export async function isBoxCodeTaken(code: string) {
  return (await db.boxes.where('code').equals(code).count()) > 0;
}

/** 箱を作成（code ユニークチェック込み） */
export async function createBox(input: { code: string; name: string; location?: string; tags?: string[] }) {
  const now = Date.now();
  if (await isBoxCodeTaken(input.code)) {
    throw new Error('既に同じ箱コードが存在します');
  }
  const id = crypto.randomUUID();
  const box: Box = {
    id,
    code: input.code,
    name: input.name,
    location: input.location,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    version: 1,
    updatedAtClient: now,
    dirty: false,
  };
  await db.boxes.add(box);
  return id;
}

export async function listBoxes(limit = 500) {
  // 最新更新順で取得
  return db.boxes.orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function getBox(id: string) {
  return db.boxes.get(id);
}

export async function getBoxByCode(code: string) {
  return db.boxes.where('code').equals(code).first();
}

export async function updateBox(id: string, patch: Partial<Pick<Box, 'name' | 'location' | 'tags'>>) {
  const now = Date.now();
  await db.boxes.update(id, { ...patch, updatedAt: now, updatedAtClient: now, dirty: true });
}

export async function removeBox(id: string) {
  // 将来はソフト削除にするなら updatedAt など更新してトゥームストーン化
  await db.transaction('rw', db.items, db.images, db.boxes, async () => {
    await db.items.where('boxId').equals(id).delete();
    await db.images.where('boxId').equals(id).delete();
    await db.boxes.delete(id);
  });
}
