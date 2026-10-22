import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { UserLocalDB, type LocalBox } from '@/lib/user-local-db';
import { applyPullPage } from '@/lib/local-sync-pull';

let db: UserLocalDB;
const stamp = '2026-10-21T00:00:00.000Z';
function box(id: string, seq: string, name = id): LocalBox {
  return {
    id, code: id, name, locationId: null, parentBoxId: null,
    tags: [], note: null, thumbs: [], meta: null, createdAt: stamp,
    updatedAt: stamp, deletedAt: null, revision: '1',
    contentHash: 'hash', syncSeq: seq,
  };
}
async function setCursor(cursor: string | null) {
  await db.syncState.put({
    id: 'SYNC', pullCursor: cursor, lastPullAt: null,
    lastPushAt: null, fullResyncAt: null,
  });
}
beforeEach(async () => {
  db = new UserLocalDB(randomUUID());
  await db.open();
  await db.initializeSyncState();
});
afterEach(async () => { await db.delete(); });

describe('v0.8 syncSeq Pull application', () => {
  it('requires full resync when cursor is null', async () => {
    await expect(applyPullPage(db, { changes: [], nextCursor: '0' }))
      .rejects.toThrow('FULL_RESYNC_REQUIRED');
  });
  it('applies ordered changes and advances cursor atomically', async () => {
    await setCursor('0');
    const changes = [
      { entityType: 'BOX' as const, entityId: 'a', syncSeq: '1', record: box('a', '1') },
      { entityType: 'BOX' as const, entityId: 'a', syncSeq: '2', record: box('a', '2', 'new') },
    ];
    expect(await applyPullPage(db, { changes, nextCursor: '3' })).toBe(2);
    expect((await db.boxes.get('a'))?.name).toBe('new');
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('3');
  });
  it('preserves pending local edits and Outbox while advancing cursor', async () => {
    await setCursor('0');
    await db.boxes.put(box('a', '0', 'local'));
    await db.outbox.put({
      entityType: 'BOX', entityId: 'a', operation: 'UPSERT',
      baseRevision: '1', contentHash: 'local-hash', payload: { name: 'local' }, createdAt: stamp,
    });
    expect(await applyPullPage(db, {
      changes: [{ entityType: 'BOX', entityId: 'a', syncSeq: '1', record: box('a', '1', 'server') }],
      nextCursor: '1',
    })).toBe(0);
    expect((await db.boxes.get('a'))?.name).toBe('local');
    expect(await db.outbox.count()).toBe(1);
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('1');
  });
  it('rolls back all changes on invalid ordering', async () => {
    await setCursor('0');
    await expect(applyPullPage(db, {
      changes: [
        { entityType: 'BOX', entityId: 'a', syncSeq: '2', record: box('a', '2') },
        { entityType: 'BOX', entityId: 'b', syncSeq: '1', record: box('b', '1') },
      ],
      nextCursor: '2',
    })).rejects.toThrow('PULL_SEQUENCE_INVALID');
    expect(await db.boxes.count()).toBe(0);
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('0');
  });
  it('compares large syncSeq without floating point precision loss', async () => {
    await setCursor('9007199254740992');
    expect(await applyPullPage(db, {
      changes: [{ entityType: 'BOX', entityId: 'a', syncSeq: '9007199254740993', record: box('a', '9007199254740993') }],
      nextCursor: '9007199254740993',
    })).toBe(1);
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('9007199254740993');
  });
});
