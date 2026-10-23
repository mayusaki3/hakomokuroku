import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserLocalDB, type LocalBox } from '@/lib/user-local-db';
import { runSyncV2Pull } from '@/lib/sync-v2-client';

const stamp = '2026-10-23T00:00:00.000Z';
function box(id: string, seq: string): LocalBox {
  return { id, code: id, name: id, locationId: null, parentBoxId: null, tags: [],
    note: null, thumbs: [], meta: null, createdAt: stamp, updatedAt: stamp,
    deletedAt: null, revision: '1', contentHash: 'h', syncSeq: seq };
}
const change = (id: string, seq: string) =>
  ({ entityType: 'BOX', entityId: id, syncSeq: seq, record: box(id, seq) });
const snapshotEntity = (id: string) =>
  ({ entityType: 'BOX', entityId: id, payload: box(id, '2'),
    revision: '1', contentHash: 'h', syncSeq: '2', serverUpdatedAt: stamp, deleted: false });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const created = { snapshotId: 'snap', snapshotSeq: '5', total: 1, expiresAt: stamp };
const snapshotPage = { snapshotId: 'snap', snapshotSeq: '5',
  entities: [snapshotEntity('snapshot')], nextOffset: 1, hasMore: false };
let db: UserLocalDB;
beforeEach(async () => {
  db = new UserLocalDB(randomUUID());
  await db.open();
  await db.initializeSyncState();
});
afterEach(async () => { await db.delete(); });

describe('v0.8 Pull / Full Resync coordination', () => {
  it('starts with Full Resync when cursor is null then resumes Pull', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json(created, 201);
      if (url.includes('/full-resync/')) return json(snapshotPage);
      if (url.includes('cursor=5')) return json({
        changes: [change('after', '6')], nextCursor: '6', hasMore: false,
      });
      throw new Error('unexpected request ' + url);
    });
    const result = await runSyncV2Pull(db, { fetcher: fetcher as unknown as typeof fetch });
    expect(result).toEqual({ resynced: true, pulledPages: 1, appliedChanges: 1 });
    expect(await db.boxes.count()).toBe(2);
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('6');
  });
  it('switches on HTTP 409 and retains Outbox', async () => {
    await db.syncState.update('SYNC', { pullCursor: '1' });
    await db.boxes.put(box('pending', '1'));
    await db.outbox.put({ entityType: 'BOX', entityId: 'pending', operation: 'UPSERT',
      baseRevision: '1', contentHash: 'local', payload: { name: 'pending' }, createdAt: stamp });
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json(created, 201);
      if (url.includes('/full-resync/')) return json(snapshotPage);
      if (url.includes('cursor=1')) return json({ error: 'FULL_RESYNC_REQUIRED' }, 409);
      return json({ changes: [], nextCursor: '5', hasMore: false });
    });
    expect((await runSyncV2Pull(db, { fetcher: fetcher as unknown as typeof fetch })).resynced).toBe(true);
    expect(await db.outbox.count()).toBe(1);
    expect(await db.boxes.get('pending')).toBeDefined();
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('5');
  });
  it('preserves current Business and cursor when Full Resync fails', async () => {
    await db.boxes.put(box('old', '1'));
    await db.syncState.update('SYNC', { pullCursor: '1' });
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json(created, 201);
      if (url.includes('/full-resync/')) throw new Error('offline');
      return json({ error: 'FULL_RESYNC_REQUIRED' }, 409);
    });
    await expect(runSyncV2Pull(db, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toThrow('offline');
    expect(await db.boxes.get('old')).toBeDefined();
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('1');
    expect((await db.resyncStage.get('STAGE'))?.snapshotId).toBe('snap');
  });
  it('pulls multiple pages without resync when cursor is valid', async () => {
    await db.syncState.update('SYNC', { pullCursor: '1' });
    const fetcher = vi.fn(async (url: string) => url.includes('cursor=1')
      ? json({ changes: [change('a', '2')], nextCursor: '2', hasMore: true })
      : json({ changes: [change('b', '3')], nextCursor: '3', hasMore: false }));
    expect(await runSyncV2Pull(db, { fetcher: fetcher as unknown as typeof fetch }))
      .toEqual({ resynced: false, pulledPages: 2, appliedChanges: 2 });
  });
});
