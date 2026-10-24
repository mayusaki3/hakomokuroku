import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserLocalDB, type LocalBoxLocation } from '@/lib/user-local-db';
import { runSyncV2Cycle } from '@/lib/sync-v2-cycle';

const stamp = '2026-10-24T00:00:00.000Z';
const record = (name: string, revision: string, syncSeq: string): LocalBoxLocation => ({
  id: 'loc', name, note: null, thumbs: [], meta: null, createdAt: stamp,
  updatedAt: stamp, deletedAt: null, revision, syncSeq, contentHash: name,
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
let db: UserLocalDB;
beforeEach(async () => {
  db = new UserLocalDB(randomUUID());
  await db.open();
  await db.initializeSyncState();
  await db.syncState.update('SYNC', { pullCursor: '0' });
});
afterEach(async () => { await db.delete(); });

describe('Pull / Push / Pull cycle', () => {
  it('coalesces simultaneous cycles and releases the guard after success', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetcher = async () => {
      calls++;
      if (calls === 1) await gate;
      return json({ changes: [], nextCursor: '0', hasMore: false });
    };
    const first = runSyncV2Cycle(db, { fetcher: fetcher as typeof fetch });
    const second = runSyncV2Cycle(db, { fetcher: fetcher as typeof fetch });
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(calls).toBe(2);
    await runSyncV2Cycle(db, { fetcher: fetcher as typeof fetch });
    expect(calls).toBe(4);
  });

  it('allows retry after an interrupted Pull without losing Outbox', async () => {
    await db.outbox.put({
      entityType: 'BOX_LOCATION', entityId: 'loc', operation: 'UPSERT',
      baseRevision: '0', contentHash: 'Local',
      payload: { ...record('Local', '0', '0') }, createdAt: stamp,
    });
    const offline = async () => { throw new Error('OFFLINE'); };
    const failures = await Promise.allSettled([
      runSyncV2Cycle(db, { fetcher: offline as typeof fetch }),
      runSyncV2Cycle(db, { fetcher: offline as typeof fetch }),
    ]);
    expect(failures.map(result => result.status)).toEqual(['rejected', 'rejected']);
    expect(await db.outbox.count()).toBe(1);
    const fetcher = async (url: string, init?: RequestInit) => {
      if (url.includes('/push')) {
        const sent = JSON.parse(String(init?.body)) as { operationId: string };
        return json({ operationId: sent.operationId, status: 'APPLIED',
          revision: '1', syncSeq: '1' });
      }
      return json({ changes: [], nextCursor: '0', hasMore: false });
    };
    const result = await runSyncV2Cycle(db, { fetcher: fetcher as typeof fetch });
    expect(result.push.applied).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it('applies a local edit then observes its authoritative remote version', async () => {
    await db.locations.put(record('Local', '0', '0'));
    await db.outbox.put({
      entityType: 'BOX_LOCATION', entityId: 'loc', operation: 'UPSERT',
      baseRevision: '0', contentHash: 'Local', payload: { ...record('Local', '0', '0') },
      createdAt: stamp,
    });
    const order: string[] = [];
    let committed = false;
    const fetcher = async (url: string, init?: RequestInit) => {
      if (url.includes('/push')) {
        order.push('push');
        const op = JSON.parse(String(init?.body)) as { operationId: string };
        committed = true;
        return json({ operationId: op.operationId, status: 'APPLIED',
          revision: '1', syncSeq: '1' });
      }
      order.push('pull');
      return committed
        ? json({ changes: [{
          entityType: 'BOX_LOCATION', entityId: 'loc', syncSeq: '1',
          record: record('Local', '1', '1'),
        }], nextCursor: '1', hasMore: false })
        : json({ changes: [], nextCursor: '0', hasMore: false });
    };
    const result = await runSyncV2Cycle(db, { fetcher: fetcher as typeof fetch });
    expect(order).toEqual(['pull', 'push', 'pull']);
    expect(result.push.applied).toBe(1);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.locations.get('loc'))?.revision).toBe('1');
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('1');
  });

  it('blocks Push after remote revision advances and preserves local edit', async () => {
    await db.locations.put(record('Local', '1', '1'));
    await db.outbox.put({
      entityType: 'BOX_LOCATION', entityId: 'loc', operation: 'UPSERT',
      baseRevision: '1', contentHash: 'Local', payload: { ...record('Local', '1', '1') },
      createdAt: stamp,
    });
    await db.syncState.update('SYNC', { pullCursor: '1' });
    let pushes = 0;
    const fetcher = async (url: string) => {
      if (url.includes('/push')) { pushes++; throw new Error('unexpected push'); }
      if (url.includes('cursor=1')) return json({ changes: [{
        entityType: 'BOX_LOCATION', entityId: 'loc', syncSeq: '2',
        record: record('Remote', '2', '2'),
      }], nextCursor: '2', hasMore: false });
      return json({ changes: [], nextCursor: '2', hasMore: false });
    };
    const result = await runSyncV2Cycle(db, { fetcher: fetcher as typeof fetch });
    expect(result.push.blocked).toBe(1);
    expect(pushes).toBe(0);
    expect((await db.outboxConflicts.get(['BOX_LOCATION', 'loc']))?.status).toBe('CONFLICT');
    expect((await db.locations.get('loc'))?.name).toBe('Local');
  });

  it('retains pending edits and cursor when Push loses connectivity', async () => {
    await db.outbox.put({
      entityType: 'BOX_LOCATION', entityId: 'loc', operation: 'UPSERT',
      baseRevision: '0', contentHash: 'Local', payload: { ...record('Local', '0', '0') },
      createdAt: stamp,
    });
    const fetcher = async (url: string) => {
      if (url.includes('/push')) throw new Error('OFFLINE');
      return json({ changes: [], nextCursor: '0', hasMore: false });
    };
    await expect(runSyncV2Cycle(db, { fetcher: fetcher as typeof fetch }))
      .rejects.toThrow('OFFLINE');
    expect(await db.outbox.count()).toBe(1);
    expect((await db.outbox.get(['BOX_LOCATION', 'loc']))?.operationId).toBeTruthy();
    expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('0');
  });
});
