import type { UserLocalDB } from '@/lib/user-local-db';
import { runSyncV2Pull, type SyncV2Options, type SyncV2Result } from '@/lib/sync-v2-client';
import { runOutboxPush, type PushRunResult } from '@/lib/outbox-push-client';

export interface SyncV2CycleOptions extends SyncV2Options {
  /** Override for testing; defaults to the browser's Web Locks API. */
  locks?: Pick<LockManager, 'request'>;
}

export interface SyncV2CycleResult {
  beforePush: SyncV2Result;
  push: PushRunResult;
  afterPush: SyncV2Result;
}

// One in-flight cycle per user database in this JavaScript runtime.
// Sharing a promise also prevents duplicate HTTP requests from reconnect
// and manual-sync triggers fired in the same tab.
const activeCycles = new Map<string, Promise<SyncV2CycleResult>>();

/**
 * Complete one synchronization cycle. Pull before Push to detect remote edits;
 * Pull again to observe accepted writes and other devices' intervening changes.
 * No network I/O occurs in an IndexedDB transaction.
 *
 * Concurrent callers for the same user database share the running cycle.
 * Web Locks serializes the full cycle across tabs in supporting browsers.\n * Without Web Locks, only the same-runtime guard is available.
 */
export async function runSyncV2Cycle(
  db: UserLocalDB, options: SyncV2CycleOptions = {},
): Promise<SyncV2CycleResult> {
  const key = db.name;
  const existing = activeCycles.get(key);
  if (existing) return existing;
  const execute = async (): Promise<SyncV2CycleResult> => {
    const beforePush = await runSyncV2Pull(db, options);
    const push = await runOutboxPush(db, options);
    const afterPush = await runSyncV2Pull(db, options);
    return { beforePush, push, afterPush };
  };
  const locks = options.locks ??
    (typeof navigator !== 'undefined' ? navigator.locks : undefined);
  // Lock is held through both Pull phases and Push; never during local edits.
  // Use a user-scoped name so different users do not block each other.
  const cycle = locks
    ? locks.request('hakomokuroku:sync-v2:' + key, { mode: 'exclusive' }, execute)
    : execute();
  activeCycles.set(key, cycle);
  try {
    return await cycle;
  } finally {
    if (activeCycles.get(key) === cycle) activeCycles.delete(key);
  }
}
