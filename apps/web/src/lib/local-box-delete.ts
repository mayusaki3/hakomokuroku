import Dexie from 'dexie';
import { type LocalBox, type LocalItem, type UserLocalDB } from '@/lib/user-local-db';

type Kind = 'BOX' | 'ITEM';
type Business = LocalBox | LocalItem;

function normalizedString(value: unknown, required: boolean): string | null {
  if (value == null) {
    if (required) throw new Error('Required business string is missing');
    return null;
  }
  if (typeof value !== 'string') throw new Error('Expected business string');
  const result = value.trim().normalize('NFC');
  if (required && !result) throw new Error('Required business string is empty');
  return result || null;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

/** Must match the server canonicalBusinessPayload field order and normalization. */
export function localCanonicalPayload(kind: Kind, row: Business): Record<string, unknown> {
  const fields = kind === 'BOX'
    ? ['code', 'name', 'locationId', 'parentBoxId', 'tags', 'note', 'thumbs', 'meta', 'deleted']
    : ['boxId', 'name', 'tags', 'note', 'thumbs', 'meta', 'deleted'];
  const source: Record<string, unknown> = { ...row, deleted: row.deletedAt !== null };
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = source[field];
    if (field === 'deleted') {
      payload[field] = value === true;
    } else if (field === 'tags') {
      if (!Array.isArray(value)) throw new Error('Expected tags array');
      payload[field] = [...new Set(value.map((v) => normalizedString(v, false)).filter((v): v is string => v !== null))].sort();
    } else if (field === 'thumbs') {
      if (!Array.isArray(value)) throw new Error('Expected thumbs array');
      payload[field] = stable(value);
    } else if (field === 'meta') {
      payload[field] = value == null ? null : stable(value);
    } else {
      payload[field] = normalizedString(value, field === 'name' || field === 'code');
    }
  }
  return payload;
}

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface LocalBoxDeleteResult {
  deletedBoxId: string;
  movedItems: number;
  movedBoxes: number;
}

/**
 * Offline-first Box deletion. Business changes and Outbox writes commit
 * atomically. Revisions remain at their last accepted server values until Pull.
 */
export async function deleteBoxLocally(db: UserLocalDB, boxId: string): Promise<LocalBoxDeleteResult> {
  return db.transaction('rw', db.boxes, db.items, db.outbox, async () => {
    const parent = await db.boxes.get(boxId);
    if (!parent || parent.deletedAt !== null) throw new Error('BOX_NOT_FOUND');

    const items = await db.items.where('boxId').equals(boxId).filter((row) => row.deletedAt === null).toArray();
    const children = await db.boxes.where('parentBoxId').equals(boxId).filter((row) => row.deletedAt === null).toArray();
    const timestamp = new Date().toISOString();

    async function save(kind: Kind, row: Business, operation: 'UPSERT' | 'DELETE') {
      const payload = localCanonicalPayload(kind, row);
      // Keep IndexedDB transaction alive while using WebCrypto.
      const contentHash = await Dexie.waitFor(hashPayload(payload));
      const updated = { ...row, contentHash };
      if (kind === 'BOX') await db.boxes.put(updated as LocalBox);
      else await db.items.put(updated as LocalItem);
      await db.upsertOutboxInTransaction({
        entityType: kind, entityId: row.id, operation,
        baseRevision: row.revision, contentHash, payload, createdAt: timestamp,
      });
    }

    for (const item of items) {
      await save('ITEM', { ...item, boxId: null, updatedAt: timestamp }, 'UPSERT');
    }
    for (const child of children) {
      await save('BOX', { ...child, parentBoxId: null, locationId: null, updatedAt: timestamp }, 'UPSERT');
    }
    await save('BOX', { ...parent, deletedAt: timestamp, updatedAt: timestamp }, 'DELETE');
    return { deletedBoxId: boxId, movedItems: items.length, movedBoxes: children.length };
  });
}
