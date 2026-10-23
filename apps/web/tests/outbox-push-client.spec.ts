import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserLocalDB, type LocalOutbox } from '@/lib/user-local-db';
import { prepareOutboxPush, acknowledgePush, recordPushConflict, runOutboxPush } from '@/lib/outbox-push-client';

let db: UserLocalDB;
const entry = (): LocalOutbox => ({
  entityType: 'BOX_LOCATION', entityId: 'loc', operation: 'UPSERT',
  baseRevision: '0', contentHash: 'h1', createdAt: '2026-10-24T00:00:00Z',
  payload: { id: 'loc', name: 'Shelf' },
});
beforeEach(async () => {
  db = new UserLocalDB(randomUUID());
  await db.open();
  await db.initializeSyncState();
});
afterEach(async () => { await db.delete(); });

describe('Outbox Push client', () => {
  it('persists an operation ID across repeated preparations', async () => {
    await db.outbox.put(entry());
    const first = (await prepareOutboxPush(db)).candidates[0];
    const second = (await prepareOutboxPush(db)).candidates[0];
    expect(first.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.operationId).toBe(first.operationId);
  });
  it('clears only an unchanged acknowledged edit', async () => {
    await db.outbox.put(entry());
    const sent = (await prepareOutboxPush(db)).candidates[0];
    expect(await acknowledgePush(db, sent, {
      operationId: sent.operationId, status: 'APPLIED', revision: '1', syncSeq: '1',
    })).toBe(true);
    expect(await db.outbox.count()).toBe(0);
  });
  it('preserves a newer edit while an older request is in flight', async () => {
    await db.outbox.put(entry());
    const sent = (await prepareOutboxPush(db)).candidates[0];
    await db.transaction('rw', db.outbox, async () => {
      await db.upsertOutboxInTransaction({ ...entry(), contentHash: 'h2',
        payload: { id: 'loc', name: 'New Shelf' } });
    });
    expect(await acknowledgePush(db, sent, {
      operationId: sent.operationId, status: 'APPLIED', revision: '1', syncSeq: '1',
    })).toBe(false);
    expect((await db.outbox.get(['BOX_LOCATION', 'loc']))?.contentHash).toBe('h2');
    expect((await db.outbox.get(['BOX_LOCATION', 'loc']))?.operationId).not.toBe(sent.operationId);
  });
  it('records conflicts without deleting local pending data', async () => {
    await db.outbox.put(entry());
    const sent = (await prepareOutboxPush(db)).candidates[0];
    expect(await recordPushConflict(db, sent, {
      operationId: sent.operationId, status: 'CONFLICT', revision: '3', syncSeq: '9',
    })).toBe(true);
    expect((await db.outboxConflicts.get(['BOX_LOCATION', 'loc']))?.status).toBe('CONFLICT');
    expect(await db.outbox.count()).toBe(1);
    expect((await prepareOutboxPush(db)).blocked[0].reason).toBe('CONFLICT');
  });
  it('retries with the same operation ID after a lost HTTP response', async () => {
    await db.outbox.put(entry());
    const seen: string[] = [];
    const fetcher = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { operationId: string };
      seen.push(body.operationId);
      if (seen.length === 1) throw new Error('NETWORK_LOST');
      return new Response(JSON.stringify({
        operationId: body.operationId, status: 'APPLIED', revision: '1', syncSeq: '1',
      }), { status: 200 });
    };
    await expect(runOutboxPush(db, { fetcher: fetcher as typeof fetch }))
      .rejects.toThrow('NETWORK_LOST');
    expect(await db.outbox.count()).toBe(1);
    expect((await runOutboxPush(db, { fetcher: fetcher as typeof fetch })).applied).toBe(1);
    expect(seen[0]).toBe(seen[1]);
    expect(await db.outbox.count()).toBe(0);
  });
});
