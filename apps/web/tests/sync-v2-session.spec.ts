import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserLocalDB } from '@/lib/user-local-db';
import { openSyncV2Session } from '@/lib/sync-v2-session';

const users: string[] = [];
afterEach(async () => {
  for (const id of users.splice(0)) await new UserLocalDB(id).delete();
});

describe('authenticated sync session', () => {
  it('isolates users and preserves unsent outbox across logout/relogin', async () => {
    const userA = randomUUID();
    const userB = randomUUID();
    users.push(userA, userB);
    const target = new EventTarget();
    const a = await openSyncV2Session(userA, { target });
    await a.db.outbox.put({
      entityType: 'BOX_LOCATION', entityId: 'offline-location', operation: 'UPSERT',
      baseRevision: '0', contentHash: 'hash', payload: { name: 'offline' },
      createdAt: new Date().toISOString(),
    });
    a.dispose();
    a.dispose();
    const b = await openSyncV2Session(userB, { target });
    expect(await b.db.outbox.count()).toBe(0);
    b.dispose();
    const aAgain = await openSyncV2Session(userA, { target });
    expect((await aAgain.db.outbox.get(['BOX_LOCATION', 'offline-location']))?.payload)
      .toEqual({ name: 'offline' });
    aAgain.dispose();
  });

  it('aborts an in-flight reconnect request on logout', async () => {
    const id = randomUUID();
    users.push(id);
    const target = new EventTarget();
    const aborted = vi.fn();
    let started!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          aborted();
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
        started();
      });
    });
    const session = await openSyncV2Session(id, {
      target, fetcher: fetcher as typeof fetch,
    });
    await session.db.syncState.update('SYNC', { pullCursor: '0' });
    target.dispatchEvent(new Event('online'));
    await began;
    session.dispose();
    await vi.waitFor(() => expect(aborted).toHaveBeenCalledTimes(1));
    target.dispatchEvent(new Event('online'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
