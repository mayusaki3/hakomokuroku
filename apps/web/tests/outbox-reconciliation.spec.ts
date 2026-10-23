import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserLocalDB, type LocalBox, type LocalOutbox } from '@/lib/user-local-db';
import { classifyOutbox } from '@/lib/outbox-reconciliation';
import { applyPullPage } from '@/lib/local-sync-pull';
import { beginFullResync, stageFullResyncPage, commitFullResync } from '@/lib/local-full-resync';

const stamp = '2026-10-23T00:00:00.000Z';
function box(id: string, rev: string, deletedAt: string | null = null): LocalBox {
  return { id, code: id, name: id, locationId: null, parentBoxId: null, tags: [],
    note: null, thumbs: [], meta: null, createdAt: stamp, updatedAt: stamp,
    deletedAt, revision: rev, contentHash: 'h', syncSeq: '3' };
}
function pending(id: string, baseRevision = '1'): LocalOutbox {
  return { entityType: 'BOX', entityId: id, operation: 'UPSERT',
    baseRevision, contentHash: 'local', payload: { name: 'local' }, createdAt: stamp };
}
let db: UserLocalDB;
beforeEach(async () => {
  db = new UserLocalDB(randomUUID());
  await db.open();
  await db.initializeSyncState();
});
afterEach(async () => { await db.delete(); });

describe('Outbox revision reconciliation', () => {
  it('distinguishes unchanged, changed, deleted and missing remote entities', () => {
    expect(classifyOutbox(pending('a'), box('a', '1')).status).toBe('READY');
    expect(classifyOutbox(pending('a'), box('a', '2')).status).toBe('CONFLICT');
    expect(classifyOutbox(pending('a'), box('a', '2', stamp)).status).toBe('REMOTE_DELETED');
    expect(classifyOutbox(pending('a'), null).status).toBe('REMOTE_MISSING');
    expect(classifyOutbox(pending('new', '0'), null).status).toBe('READY');
  });
  it('records conflict on Pull while preserving local Business and Outbox', async () => {
    await db.syncState.update('SYNC', { pullCursor: '2' });
    await db.boxes.put(box('a', '1'));
    await db.outbox.put(pending('a'));
    expect(await applyPullPage(db, { changes: [
      { entityType: 'BOX', entityId: 'a', syncSeq: '3', record: box('a', '2') },
    ], nextCursor: '3' })).toBe(0);
    expect((await db.outboxConflicts.get(['BOX', 'a']))?.status).toBe('CONFLICT');
    expect((await db.outboxConflicts.get(['BOX', 'a']))?.remoteRevision).toBe('2');
    expect((await db.boxes.get('a'))?.revision).toBe('1');
    expect(await db.outbox.count()).toBe(1);
  });
  it('reconciles against server snapshot, not preserved local projection', async () => {
    await db.boxes.put(box('a', '1'));
    await db.outbox.put(pending('a'));
    await beginFullResync(db, 's', '5', 1);
    await stageFullResyncPage(db, { snapshotId: 's', snapshotSeq: '5', entities: [{
      entityType: 'BOX', entityId: 'a', payload: box('a', '2') as unknown as Record<string, unknown>,
      revision: '2', contentHash: 'remote', syncSeq: '3', serverUpdatedAt: stamp, deleted: false,
    }], nextOffset: 1, hasMore: false });
    await commitFullResync(db, 's', 1);
    expect((await db.outboxConflicts.get(['BOX', 'a']))?.status).toBe('CONFLICT');
    expect((await db.outboxConflicts.get(['BOX', 'a']))?.remoteRecord?.revision).toBe('2');
    expect((await db.boxes.get('a'))?.revision).toBe('1');
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('5');
  });
  it('keeps missing remote as explicit conflict after snapshot', async () => {
    await db.boxes.put(box('a', '1'));
    await db.outbox.put(pending('a'));
    await beginFullResync(db, 's', '5', 0);
    await stageFullResyncPage(db, { snapshotId: 's', snapshotSeq: '5',
      entities: [], nextOffset: 0, hasMore: false });
    await commitFullResync(db, 's', 0);
    expect((await db.outboxConflicts.get(['BOX', 'a']))?.status).toBe('REMOTE_MISSING');
    expect(await db.boxes.get('a')).toBeDefined();
  });
});
