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
  blob?: Blob;
  thumbBlob?: Blob;
  blobKey?: string;     // 将来S3キー等
  dataUrl?: string;     // MVPはDataURLでも可。最終的にはBlob保管推奨
  w: number;
  h: number;
  exif?: any;
  createdAt: ISOms;
  order?: number;
}

class HKDB extends Dexie {
  boxes!: Table<Box, string>;
  items!: Table<Item, string>;
  images!: Table<ImageRec, string>;

  constructor() {
    super('hakomokuroku');

    // v2: tags を multiEntry 化
    this.version(1).stores({
      boxes: '&id, code, name, location, updatedAt',
      items: '&id, boxId, name, updatedAt',
      images: '&id, boxId, itemId, createdAt',
    });

    this.version(2).stores({
      boxes: '&id, code, name, location, *tags, updatedAt',
      items: '&id, boxId, name, *tags, updatedAt',
      images: '&id, boxId, itemId, createdAt',
    }).upgrade(tx => tx.table('boxes').toCollection().modify((b: any) => {
      if (!Array.isArray(b.tags)) b.tags = [];
    }));

    // v3: 画像に blob/thumbBlob を追加（スキーマ変更なし＝no-op）
    this.version(3).stores({
      boxes: '&id, code, name, location, *tags, updatedAt',
      items: '&id, boxId, name, *tags, updatedAt',
      images: '&id, boxId, itemId, createdAt',
    });

    // v4: images に order インデックスを追加
    this.version(4).stores({
      boxes: '&id, code, name, location, *tags, updatedAt',
      items: '&id, boxId, name, *tags, updatedAt',
      images: '&id, boxId, itemId, createdAt, order', // order をインデックス化
    }).upgrade(async tx => {
      // 既存画像に order が無い場合は createdAt の昇順で 10,20,30... を付与
      const t = tx.table('images');
      const byItem: Record<string, any[]> = {};
      await t.toCollection().modify((im: any) => {
        const key = im.itemId || '_';
        (byItem[key] ??= []).push(im);
      });
      for (const arr of Object.values(byItem)) {
        arr.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
        arr.forEach((im, idx) => im.order ??= (idx + 1) * 10);
      }
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

export interface ImageRec {
  id: string;
  owner?: string;
  boxId?: string;
  itemId?: string;
  // ▼ 追加（MVPはBlobで直接保存）
  blob?: Blob;         // 元画像（長辺 ~1600px）
  thumbBlob?: Blob;    // サムネ（長辺 ~400px）
  // 既存（将来用）
  blobKey?: string;
  dataUrl?: string;
  w: number;
  h: number;
  exif?: any;
  createdAt: ISOms;
}

// ▼ アイテムAPI
export async function createItem(boxId: string, input: Omit<Item,'id'|'boxId'|'createdAt'|'updatedAt'>) {
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.items.add({ ...input, id, boxId, createdAt: now, updatedAt: now });
  await db.boxes.update(boxId, { updatedAt: now });
  return id;
}

export async function listItemsByBox(boxId: string) {
  return db.items.where('boxId').equals(boxId).reverse().sortBy('updatedAt');
}

export async function getItem(itemId: string) {
  return db.items.get(itemId);
}

export async function removeItem(itemId: string) {
  const it = await db.items.get(itemId);
  if (!it) return;
  await db.transaction('rw', db.images, db.items, async () => {
    await db.images.where('itemId').equals(itemId).delete();
    await db.items.delete(itemId);
  });
  await db.boxes.update(it.boxId, { updatedAt: Date.now() });
}
// ▼ 画像API
// 既存 addImagesToItem を「末尾に追加」できるよう更新
export async function addImagesToItem(params: {
  boxId: string;
  itemId: string;
  images: Array<{ blob: Blob; thumbBlob: Blob; w: number; h: number; exif?: any }>;
}) {
  const now = Date.now();
  // 末尾の現在最大 order を取得（無ければ 0）
  const last = await db.images.where('itemId').equals(params.itemId).sortBy('order');
  const base = last.length ? (last[last.length - 1].order ?? 0) : 0;

  const recs: ImageRec[] = params.images.map((img, i) => ({
    id: crypto.randomUUID(),
    boxId: params.boxId,
    itemId: params.itemId,
    blob: img.blob,
    thumbBlob: img.thumbBlob,
    w: img.w,
    h: img.h,
    exif: img.exif,
    createdAt: now,
    order: base + (i + 1) * 10, // ステップ幅10で末尾に
  }));
  await db.images.bulkAdd(recs);
  await db.items.update(params.itemId, { updatedAt: now });
}

export async function listImagesByItemOrdered(itemId: string) {
  const arr = await db.images.where('itemId').equals(itemId).toArray();
  return arr.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
}

// ▼ 追加：1枚削除
export async function removeImage(imageId: string) {
  await db.images.delete(imageId);
}

// ▼ 追加：順序の一括保存（orderedIds の並びで 10,20.. を振り直し）
export async function setImageOrder(itemId: string, orderedIds: string[]) {
  const updates = orderedIds.map((id, idx) => ({ id, order: (idx + 1) * 10 }));
  await db.transaction('rw', db.images, async () => {
    for (const u of updates) {
      await db.images.update(u.id, { order: u.order });
    }
    await db.items.update(itemId, { updatedAt: Date.now() });
  });
}
