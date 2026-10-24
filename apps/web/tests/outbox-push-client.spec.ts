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
    expect((await db.outbox.get(['BOX_LOCATION', 'loc']))?.baseRevision).toBe('1');
    expect((await db.outbox.get(['BOX_LOCATION', 'loc']))?.operationId).not.toBe(sent.operationId);
  });
  it('rebases a newer edit and sends it using the acknowledged revision', async () => {
    await db.outbox.put(entry());
    const first = (await prepareOutboxPush(db)).candidates[0];
    await db.transaction('rw', db.outbox, async () => {
      await db.upsertOutboxInTransaction({
        ...entry(), contentHash: 'h2', payload: { id: 'loc', name: 'New Shelf' },
      });
    });
    await acknowledgePush(db, first, {
      operationId: first.operationId, status: 'APPLIED', revision: '4', syncSeq: '12',
    });
    const next = (await prepareOutboxPush(db)).candidates[0];
    expect(next.baseRevision).toBe('4');
    expect(next.contentHash).toBe('h2');
    expect(next.operationId).not.toBe(first.operationId);
    expect((await db.outboxConflicts.count())).toBe(0);
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
  it('replays a lost acknowledged Push before a newer offline edit', async () => {
    await db.outbox.put(entry());
    const seen: Array<{ operationId: string; baseRevision: string; contentHash: string }> = [];
    const fetcher = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        operationId: string; baseRevision: string; contentHash: string;
      };
      seen.push(body);
      if (seen.length === 1) throw new Error('RESPONSE_LOST');
      const revision = body.contentHash === 'h1' ? '4' : '5';
      return new Response(JSON.stringify({
        operationId: body.operationId, status: 'APPLIED',
        revision, syncSeq: revision,
      }), { status: 200 });
    };
    await expect(runOutboxPush(db, { fetcher: fetcher as typeof fetch }))
      .rejects.toThrow('RESPONSE_LOST');
    expect(await db.pushPending.count()).toBe(1);
    await db.transaction('rw', db.outbox, async () => {
      await db.upsertOutboxInTransaction({
        ...entry(), contentHash: 'h2', payload: { id: 'loc', name: 'Updated' },
      });
    });
    expect((await db.outbox.get(['BOX_LOCATION', 'loc']))?.operationId)
      .not.toBe(seen[0].operationId);
    await runOutboxPush(db, { fetcher: fetcher as typeof fetch });
    expect(seen).toHaveLength(3);
    expect(seen[1].operationId).toBe(seen[0].operationId);
    expect(seen[2].baseRevision).toBe('4');
    expect(seen[2].contentHash).toBe('h2');
    expect(await db.pushPending.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('blocks newer edits when a replayed older Push conflicts', async () => {
    await db.outbox.put(entry());
    const requests: string[] = [];
    const fetcher = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { operationId: string };
      requests.push(body.operationId);
      if (requests.length === 1) throw new Error('RESPONSE_LOST');
      return new Response(JSON.stringify({
        operationId: body.operationId, status: 'CONFLICT', revision: '7', syncSeq: '7',
      }), { status: 409 });
    };
    await expect(runOutboxPush(db, { fetcher: fetcher as typeof fetch }))
      .rejects.toThrow('RESPONSE_LOST');
    await db.transaction('rw', db.outbox, async () => {
      await db.upsertOutboxInTransaction({
        ...entry(), contentHash: 'h2', payload: { id: 'loc', name: 'Local newer edit' },
      });
    });
    const result = await runOutboxPush(db, { fetcher: fetcher as typeof fetch });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toBe(requests[0]);
    expect(result.conflicts).toBe(1);
    expect(result.blocked).toBe(1);
    expect(await db.pushPending.count()).toBe(0);
    expect((await db.outbox.get(['BOX_LOCATION', 'loc']))?.contentHash).toBe('h2');
    expect((await db.outboxConflicts.get(['BOX_LOCATION', 'loc']))?.status).toBe('CONFLICT');
    expect((await prepareOutboxPush(db)).candidates).toHaveLength(0);
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
