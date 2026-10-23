import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserLocalDB, type LocalBox } from '@/lib/user-local-db';
import { runFullResync } from '@/lib/full-resync-client';

const stamp = '2026-10-23T00:00:00.000Z';
function box(id: string): LocalBox {
  return { id, code: id, name: id, locationId: null, parentBoxId: null,
    tags: [], note: null, thumbs: [], meta: null, createdAt: stamp, updatedAt: stamp,
    deletedAt: null, revision: '1', contentHash: 'h', syncSeq: '2' };
}
function entity(id: string) {
  return { entityType: 'BOX', entityId: id, payload: box(id), revision: '1',
    contentHash: 'h', syncSeq: '2', serverUpdatedAt: stamp, deleted: false };
}
function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
let db: UserLocalDB;
beforeEach(async () => {
  db = new UserLocalDB(randomUUID());
  await db.open();
  await db.initializeSyncState();
  it('rejects an early final page without replacing Business or cursor', async () => {
    await db.boxes.put(box('old'));
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return ok({ snapshotId: 'short', snapshotSeq: '8', total: 2, expiresAt: stamp }, 201);
      return ok({ snapshotId: 'short', snapshotSeq: '8', entities: [entity('a')],
        nextOffset: 1, hasMore: false });
    });
    await expect(runFullResync(db, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toThrow('RESYNC_TOTAL_MISMATCH');
    expect((await db.boxes.get('old'))?.name).toBe('old');
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBeNull();
    expect((await db.resyncStage.get('STAGE'))?.nextOffset).toBe(0);
  });
  it('rejects extra rows beyond declared total', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return ok({ snapshotId: 'long', snapshotSeq: '8', total: 1, expiresAt: stamp }, 201);
      return ok({ snapshotId: 'long', snapshotSeq: '8', entities: [entity('a'), entity('b')],
        nextOffset: 2, hasMore: false });
    });
    await expect(runFullResync(db, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toThrow('RESYNC_TOTAL_MISMATCH');
    expect(await db.boxes.count()).toBe(0);
  });
  it('persists total across interrupted and resumed transfers', async () => {
    let fail = true;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return ok({ snapshotId: 'resume', snapshotSeq: '8', total: 2, expiresAt: stamp }, 201);
      if (url.includes('offset=0')) return ok({ snapshotId: 'resume', snapshotSeq: '8',
        entities: [entity('a')], nextOffset: 1, hasMore: true });
      if (fail) throw new Error('network down');
      return ok({ snapshotId: 'resume', snapshotSeq: '8',
        entities: [entity('b')], nextOffset: 2, hasMore: false });
    });
    await expect(runFullResync(db, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toThrow('network down');
    expect((await db.resyncStage.get('STAGE'))?.expectedTotal).toBe(2);
    fail = false;
    expect(await runFullResync(db, { fetcher: fetcher as unknown as typeof fetch })).toBe(2);
  });
});
afterEach(async () => { await db.delete(); });

describe('Full Resync HTTP orchestration', () => {
  it('fetches all pages and commits only at the end', async () => {
    await db.boxes.put(box('old'));
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return ok({ snapshotId: 's1', snapshotSeq: '8', total: 2, expiresAt: stamp }, 201);
      if (url.includes('offset=0')) {
        expect(await db.boxes.get('old')).toBeDefined();
        return ok({ snapshotId: 's1', snapshotSeq: '8', entities: [entity('a')],
          nextOffset: 1, hasMore: true });
      }
      expect(await db.boxes.get('old')).toBeDefined();
      return ok({ snapshotId: 's1', snapshotSeq: '8', entities: [entity('b')],
        nextOffset: 2, hasMore: false });
    });
    expect(await runFullResync(db, { fetcher: fetcher as unknown as typeof fetch, pageLimit: 1 })).toBe(2);
    expect(await db.boxes.get('old')).toBeUndefined();
    expect(await db.boxes.count()).toBe(2);
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('8');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('retains staging and resumes at the stored offset after a network failure', async () => {
    await db.boxes.put(box('old'));
    let fail = true;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return ok({ snapshotId: 's2', snapshotSeq: '8', total: 2, expiresAt: stamp }, 201);
      if (url.includes('offset=0')) return ok({ snapshotId: 's2', snapshotSeq: '8',
        entities: [entity('a')], nextOffset: 1, hasMore: true });
      if (fail) throw new Error('network down');
      return ok({ snapshotId: 's2', snapshotSeq: '8',
        entities: [entity('b')], nextOffset: 2, hasMore: false });
    });
    await expect(runFullResync(db, { fetcher: fetcher as unknown as typeof fetch, pageLimit: 1 }))
      .rejects.toThrow('network down');
    expect((await db.resyncStage.get('STAGE'))?.nextOffset).toBe(1);
    expect(await db.boxes.get('old')).toBeDefined();
    fail = false;
    expect(await runFullResync(db, { fetcher: fetcher as unknown as typeof fetch, pageLimit: 1 })).toBe(2);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(await db.boxes.count()).toBe(2);
  });
  it('clears expired staging without touching Business or Outbox', async () => {
    await db.boxes.put(box('old'));
    await db.resyncStage.put({ id: 'STAGE', snapshotId: 'expired', snapshotSeq: '8',
      nextOffset: 0, complete: false, expectedTotal: 1 });
    const fetcher = vi.fn(async () => ok({ error: 'SNAPSHOT_EXPIRED' }, 410));
    await expect(runFullResync(db, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toThrow('SNAPSHOT_EXPIRED');
    expect(await db.resyncStage.count()).toBe(0);
    expect(await db.boxes.get('old')).toBeDefined();
  });
});
