import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserLocalDB } from '@/lib/user-local-db';
import { attachOnlineSync } from '@/lib/sync-v2-online';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
let db: UserLocalDB;
let target: EventTarget;
beforeEach(async () => {
  db = new UserLocalDB(randomUUID());
  await db.open();
  await db.initializeSyncState();
  await db.syncState.update('SYNC', { pullCursor: '0' });
  target = new EventTarget();
});
afterEach(async () => { await db.delete(); });

describe('online reconnect synchronization', () => {
  it('starts Pull-Push-Pull when connectivity returns and stops after disposal', async () => {
    const fetcher = vi.fn(async () => json({ changes: [], nextCursor: '0', hasMore: false }));
    const completed = vi.fn();
    const detach = attachOnlineSync(db, {
      target, fetcher: fetcher as typeof fetch, onSuccess: completed,
    });
    target.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledTimes(2);
    detach();
    target.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('coalesces repeated reconnect events and permits retry after failure', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        await gate;
        throw new Error('OFFLINE_AGAIN');
      }
      return json({ changes: [], nextCursor: '0', hasMore: false });
    });
    const failed = vi.fn();
    const succeeded = vi.fn();
    const detach = attachOnlineSync(db, {
      target, fetcher: fetcher as typeof fetch, onError: failed, onSuccess: succeeded,
    });
    target.dispatchEvent(new Event('online'));
    target.dispatchEvent(new Event('online'));
    release();
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(2));
    expect(calls).toBe(1);
    target.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(succeeded).toHaveBeenCalledTimes(1));
    expect(calls).toBe(3);
    detach();
  });

  it('does not emit completion callbacks after logout/disposal', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const success = vi.fn();
    const fetcher = async () => {
      await gate;
      return json({ changes: [], nextCursor: '0', hasMore: false });
    };
    const detach = attachOnlineSync(db, { target, fetcher: fetcher as typeof fetch, onSuccess: success });
    target.dispatchEvent(new Event('online'));
    detach();
    release();
    await vi.waitFor(async () => expect((await db.syncState.get('SYNC'))?.pullCursor).toBe('0'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(success).not.toHaveBeenCalled();
  });
});
