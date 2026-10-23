import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserLocalDB, type LocalOutbox } from '@/lib/user-local-db';
import { planOutboxPush } from '@/lib/outbox-push-plan';

let db: UserLocalDB;
const stamp = '2026-10-24T00:00:00.000Z';
const change = (id: string, baseRevision = '1'): LocalOutbox => ({
  entityType: 'BOX', entityId: id, operation: 'UPSERT', baseRevision,
  contentHash: 'hash-' + id, payload: { name: id }, createdAt: stamp,
});
beforeEach(async () => {
  db = new UserLocalDB(randomUUID());
  await db.open();
  await db.initializeSyncState();
});
afterEach(async () => { await db.delete(); });

describe('Outbox Push preflight', () => {
  it('selects unchanged entries without mutating the Outbox', async () => {
    await db.outbox.put(change('a'));
    expect(await planOutboxPush(db)).toEqual({ candidates: [change('a')], blocked: [] });
    expect(await db.outbox.count()).toBe(1);
  });
  it('blocks known conflicts and remote deletions', async () => {
    await db.outbox.bulkPut([change('a'), change('b')]);
    for (const [id, status] of [['a', 'CONFLICT'], ['b', 'REMOTE_DELETED']] as const) {
      await db.outboxConflicts.put({ entityType: 'BOX', entityId: id,
        status, baseRevision: '1', remoteRevision: '2',
        remoteDeleted: status === 'REMOTE_DELETED', remoteRecord: null });
    }
    const plan = await planOutboxPush(db);
    expect(plan.candidates).toEqual([]);
    expect(plan.blocked.map(b => b.reason).sort()).toEqual(['CONFLICT', 'REMOTE_DELETED']);
  });
  it('blocks stale conflict metadata after a local base revision changes', async () => {
    await db.outbox.put(change('a', '2'));
    await db.outboxConflicts.put({ entityType: 'BOX', entityId: 'a',
      status: 'READY', baseRevision: '1', remoteRevision: '1',
      remoteDeleted: false, remoteRecord: null });
    expect((await planOutboxPush(db)).blocked[0].reason).toBe('OUTBOX_BASE_REVISION_CHANGED');
  });
  it('rejects invalid revision without modifying records', async () => {
    await db.outbox.put(change('a', 'not-a-revision'));
    expect((await planOutboxPush(db)).blocked[0].reason).toBe('INVALID_OUTBOX_REVISION');
    expect(await db.outbox.count()).toBe(1);
  });
});
