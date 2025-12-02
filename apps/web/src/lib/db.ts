// apps/web/src/lib/db.ts
import Dexie, { Table } from 'dexie';

export type AIState = 'pending' | 'processing' | 'done' | 'error';

export interface Box {
  id: string;
  code: string;
  name: string;
  location?: string | null;
  tags?: string[] | null;
  thumbs?: string[] | null;
  meta?: any | null;
  aiState?: AIState | null;
  aiUpdatedAt?: string | null; // ISO
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

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
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface BoxLocation {
  id: string;
  boxId: string;
  thumbs?: string[] | null; // 置き場所のサムネ
  note?: string | null;
  meta?: any | null;
  aiState?: AIState | null;
  aiUpdatedAt?: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export type TagKind = 'BOX' | 'ITEM' | 'SHARED';

export interface Tag {
  id: string;
  name: string;
  kind: TagKind;
  enabled: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// Dexie v3
class HKDB extends Dexie {
  boxes!: Table<Box, string>;
  items!: Table<Item, string>;
  boxLocations!: Table<BoxLocation, string>;
  tags!: Table<Tag, string>;

  constructor() {
    super('hk-local-v1');
    // v1 スキーマ
    this.version(1).stores({
      boxes: 'id, code, updatedAt, aiState',
      items: 'id, boxId, updatedAt, aiState, name',
      boxLocations: 'id, boxId, updatedAt, aiState',
      tags: 'id, [name+kind], enabled',
    });
  }
}

export const db = new HKDB();

// DevConsole 支援
(globalThis as any).__hkdb = db;
(globalThis as any).__hkdbReset = async () => {
  // Dexie DB を削除して再オープン
  await db.delete();
  await db.open();
  return 'ok';
};

export async function getBox(id: string) {
  return await db.boxes.get(id);
}

export const UNASSIGNED_BOX_ID = 'UNASSIGNED';
export const UNASSIGNED_BOX_CODE = 'UNASSIGNED'; // 仮置き箱（アプリ側の運用で使用）

/** 仮置き箱（UNASSIGNED）を必ず用意する */
export async function ensureUnassignedBox() {
  const exists = await db.boxes.get(UNASSIGNED_BOX_ID);
  if (!exists) {
    const now = new Date().toISOString();
    await db.boxes.add({
      id: UNASSIGNED_BOX_ID,
      code: UNASSIGNED_BOX_ID,
      name: '仮置き箱',
      location: null,
      tags: [],
      thumbs: [],
      meta: null,
      aiState: null,
      aiUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * 箱を削除する（アイテムは仮置き箱に移動）
 * - 対象箱の Item.boxId を UNASSIGNED に更新
 * - BoxLocation は削除
 * - Box 自体を削除
 */
export async function removeBox(boxId: string) {
  if (boxId === UNASSIGNED_BOX_ID) {
    throw new Error('仮置き箱は削除できません');
  }
  const now = new Date().toISOString();

  await ensureUnassignedBox();

  await db.transaction('rw', db.items, db.boxLocations, db.boxes, async () => {
    // アイテムを仮置き箱へ移動
    await db.items
      .where('boxId')
      .equals(boxId)
      .modify((it) => {
        it.boxId = UNASSIGNED_BOX_ID;
        it.updatedAt = now;
      });

    // 置き場所情報は削除（箱自体が無くなるため）
    await db.boxLocations.where('boxId').equals(boxId).delete();

    // 箱削除
    await db.boxes.delete(boxId);
  });
}

// ID または Code で箱を探す（空文字なら null）
export async function findBoxByCodeOrId(key: string | null | undefined) {
  const s = (key ?? '').trim();
  if (!s) return null;
  // 1) id 直指定
  let box = await db.boxes.get(s);
  if (box) return box;
  // 2) code 一致
  box = await db.boxes.where('code').equals(s).first();
  return box ?? null;
}

// アイテム1件を別箱へ移動（updatedAt を更新）
export async function moveItem(itemId: string, targetBoxId: string) {
  if (!itemId || !targetBoxId) throw new Error('invalid args');
  const now = new Date().toISOString();

  await ensureUnassignedBox();

  const target = await db.boxes.get(targetBoxId);
  if (!target) throw new Error('移動先の箱が存在しません');

  const it = await db.items.get(itemId);
  if (!it) throw new Error('アイテムが存在しません');
  if (it.boxId === targetBoxId) return it; // no-op

  await db.items.update(itemId, { boxId: targetBoxId, updatedAt: now });
  return db.items.get(itemId);
}

// 複数アイテムを一括移動（後でリスト画面から使う）
export async function moveItems(itemIds: string[], targetBoxId: string) {
  if (!itemIds?.length) return 0;
  const now = new Date().toISOString();

  await ensureUnassignedBox();

  const target = await db.boxes.get(targetBoxId);
  if (!target) throw new Error('移動先の箱が存在しません');

  return db.transaction('rw', db.items, async () => {
    let count = 0;
    await db.items
      .where('id')
      .anyOf(itemIds)
      .modify((it) => {
        if (it.boxId !== targetBoxId) {
          it.boxId = targetBoxId;
          it.updatedAt = now;
          count++;
        }
      });
    return count;
  });
}
