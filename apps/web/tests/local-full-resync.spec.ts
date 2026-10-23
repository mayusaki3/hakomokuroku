import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserLocalDB, type LocalBox } from '@/lib/user-local-db';
import { beginFullResync, commitFullResync, stageFullResyncPage, type FullResyncEntity } from '@/lib/local-full-resync';

const stamp = '2026-10-23T00:00:00.000Z';
function box(id: string, name = id): LocalBox {
  return { id, code: id, name, locationId: null, parentBoxId: null, tags: [],
    note: null, thumbs: [], meta: null, createdAt: stamp, updatedAt: stamp,
    deletedAt: null, revision: '1', contentHash: 'h', syncSeq: '3' };
}
function entity(id: string, name = id): FullResyncEntity {
  return { entityType: 'BOX', entityId: id, payload: box(id, name) as unknown as Record<string, unknown>,
    revision: '1', contentHash: 'h', syncSeq: '3', serverUpdatedAt: stamp, deleted: false };
}
let db: UserLocalDB;
beforeEach(async () => {
  db = new UserLocalDB(randomUUID());
  await db.open();
  await db.initializeSyncState();
});
afterEach(async () => { await db.delete(); });

describe('local Full Resync staging and adoption', () => {
  it('keeps current Business until final page and commits cursor atomically', async () => {
    await db.boxes.put(box('old'));
    await beginFullResync(db, 'snap', '9');
    await stageFullResyncPage(db, { snapshotId: 'snap', snapshotSeq: '9',
      entities: [entity('new')], nextOffset: 1, hasMore: true });
    expect((await db.boxes.get('old'))?.name).toBe('old');
    await expect(commitFullResync(db, 'snap', 1)).rejects.toThrow('RESYNC_INCOMPLETE');
    await stageFullResyncPage(db, { snapshotId: 'snap', snapshotSeq: '9',
      entities: [], nextOffset: 1, hasMore: false });
    await commitFullResync(db, 'snap', 1);
    expect(await db.boxes.get('old')).toBeUndefined();
    expect((await db.boxes.get('new'))?.name).toBe('new');
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('9');
    expect(await db.resyncStage.count()).toBe(0);
  });
  it('preserves pending local changes and Outbox', async () => {
    await db.boxes.put(box('pending', 'local'));
    await db.outbox.put({ entityType: 'BOX', entityId: 'pending', operation: 'UPSERT',
      baseRevision: '1', contentHash: 'local', payload: { name: 'local' }, createdAt: stamp });
    await beginFullResync(db, 'snap', '9');
    await stageFullResyncPage(db, { snapshotId: 'snap', snapshotSeq: '9',
      entities: [entity('pending', 'server'), entity('fresh')], nextOffset: 2, hasMore: false });
    await commitFullResync(db, 'snap', 2);
    expect((await db.boxes.get('pending'))?.name).toBe('local');
    expect((await db.boxes.get('fresh'))?.name).toBe('fresh');
    expect(await db.outbox.count()).toBe(1);
  });
  it('rejects wrong snapshot and duplicate entities without advancing offset', async () => {
    await beginFullResync(db, 'snap', '9');
    await expect(stageFullResyncPage(db, { snapshotId: 'other', snapshotSeq: '9',
      entities: [entity('a')], nextOffset: 1, hasMore: false })).rejects.toThrow('RESYNC_SNAPSHOT_MISMATCH');
    await expect(stageFullResyncPage(db, { snapshotId: 'snap', snapshotSeq: '9',
      entities: [entity('a'), entity('a')], nextOffset: 2, hasMore: false })).rejects.toThrow('RESYNC_DUPLICATE_ENTITY');
    expect((await db.resyncStage.get('STAGE'))?.nextOffset).toBe(0);
    expect(await db.resyncEntities.count()).toBe(0);
  });
});
