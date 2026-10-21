import 'fake-indexeddb/auto';
import { webcrypto, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserLocalDB, type LocalBox, type LocalItem } from '@/lib/user-local-db';
import { deleteBoxLocally } from '@/lib/local-box-delete';
import { businessContentHash } from '@/server/business-content-hash';

vi.stubGlobal('crypto', webcrypto);

let db: UserLocalDB;
const stamp = '2026-10-21T00:00:00.000Z';
const box = (id: string, overrides: Partial<LocalBox> = {}): LocalBox => ({
  id, code: id, name: id, locationId: null, parentBoxId: null,
  tags: [], note: null, thumbs: [], meta: null, createdAt: stamp,
  updatedAt: stamp, deletedAt: null, revision: '3', contentHash: 'old',
  syncSeq: '7', ...overrides,
});
const item = (id: string, boxId: string | null, overrides: Partial<LocalItem> = {}): LocalItem => ({
  id, boxId, name: id, tags: [], note: null, thumbs: [], meta: null,
  createdAt: stamp, updatedAt: stamp, deletedAt: null,
  revision: '2', contentHash: 'old', syncSeq: '8', ...overrides,
});

beforeEach(async () => {
  db = new UserLocalDB(randomUUID());
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe('v0.8 local Box deletion and Outbox', () => {
  it('detaches only active direct children and atomically queues changes', async () => {
    await db.boxes.bulkAdd([
      box('parent'), box('child', { parentBoxId: 'parent', locationId: 'location' }),
      box('grandchild', { parentBoxId: 'child' }),
      box('deleted-child', { parentBoxId: 'parent', deletedAt: stamp }),
    ]);
    await db.items.bulkAdd([
      item('active', 'parent'), item('deleted', 'parent', { deletedAt: stamp }),
    ]);
    expect(await deleteBoxLocally(db, 'parent')).toEqual({
      deletedBoxId: 'parent', movedItems: 1, movedBoxes: 1,
    });
    expect((await db.boxes.get('parent'))?.deletedAt).not.toBeNull();
    expect((await db.boxes.get('child'))?.parentBoxId).toBeNull();
    expect((await db.boxes.get('child'))?.locationId).toBeNull();
    expect((await db.boxes.get('grandchild'))?.parentBoxId).toBe('child');
    expect((await db.boxes.get('deleted-child'))?.parentBoxId).toBe('parent');
    expect((await db.items.get('active'))?.boxId).toBeNull();
    expect((await db.items.get('deleted'))?.boxId).toBe('parent');
    const queued = await db.outbox.toArray();
    expect(queued).toHaveLength(3);
    expect(queued.find((x) => x.entityId === 'parent')?.operation).toBe('DELETE');
    expect(queued.find((x) => x.entityId === 'child')?.operation).toBe('UPSERT');
    expect(queued.find((x) => x.entityId === 'active')?.operation).toBe('UPSERT');
    for (const row of [await db.boxes.get('parent'), await db.boxes.get('child'), await db.items.get('active')]) {
      expect(row?.revision).toMatch(/^[23]$/);
      const kind = row?.id === 'active' ? 'ITEM' : 'BOX';
      expect(row?.contentHash).toBe(businessContentHash(kind, row!));
      expect(queued.find((x) => x.entityId === row?.id)?.contentHash).toBe(row?.contentHash);
    }
  });

  it('preserves original baseRevision and creation time for an existing Outbox entry', async () => {
    await db.boxes.add(box('parent'));
    await db.outbox.add({
      entityType: 'BOX', entityId: 'parent', operation: 'UPSERT',
      baseRevision: '1', contentHash: 'old', payload: { name: 'old' }, createdAt: stamp,
    });
    await deleteBoxLocally(db, 'parent');
    const entry = await db.outbox.get(['BOX', 'parent']);
    expect(entry?.baseRevision).toBe('1');
    expect(entry?.createdAt).toBe(stamp);
    expect(entry?.operation).toBe('DELETE');
    expect(entry?.payload.deleted).toBe(true);
  });

  it('rolls back business and Outbox if a later child fails validation', async () => {
    await db.boxes.add(box('parent'));
    await db.items.bulkAdd([item('a', 'parent'), item('z', 'parent', { name: '  ' })]);
    await expect(deleteBoxLocally(db, 'parent')).rejects.toThrow('Required business string is empty');
    expect((await db.items.get('a'))?.boxId).toBe('parent');
    expect((await db.boxes.get('parent'))?.deletedAt).toBeNull();
    expect(await db.outbox.count()).toBe(0);
  });

  it('keeps different users in different databases', async () => {
    const other = new UserLocalDB(randomUUID());
    try {
      await other.open();
      await db.boxes.add(box('same-id'));
      await other.boxes.add(box('same-id'));
      await deleteBoxLocally(db, 'same-id');
      expect((await other.boxes.get('same-id'))?.deletedAt).toBeNull();
      expect(await other.outbox.count()).toBe(0);
    } finally {
      await other.delete();
    }
  });

  it('rejects repeated deletion without changing the Outbox', async () => {
    await db.boxes.add(box('parent'));
    await deleteBoxLocally(db, 'parent');
    const before = await db.outbox.get(['BOX', 'parent']);
    await expect(deleteBoxLocally(db, 'parent')).rejects.toThrow('BOX_NOT_FOUND');
    expect(await db.outbox.get(['BOX', 'parent'])).toEqual(before);
  });
});
