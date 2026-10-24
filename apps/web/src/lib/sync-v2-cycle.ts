import type { UserLocalDB } from '@/lib/user-local-db';
import { runSyncV2Pull, type SyncV2Options, type SyncV2Result } from '@/lib/sync-v2-client';
import { runOutboxPush, type PushRunResult } from '@/lib/outbox-push-client';

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
 * Cross-tab serialization is not covered by this in-memory guard.
 */
export async function runSyncV2Cycle(
  db: UserLocalDB, options: SyncV2Options = {},
): Promise<SyncV2CycleResult> {
  const key = db.name;
  const existing = activeCycles.get(key);
  if (existing) return existing;
  const cycle = (async (): Promise<SyncV2CycleResult> => {
    const beforePush = await runSyncV2Pull(db, options);
    const push = await runOutboxPush(db, options);
    const afterPush = await runSyncV2Pull(db, options);
    return { beforePush, push, afterPush };
  })();
  activeCycles.set(key, cycle);
  try {
    return await cycle;
  } finally {
    if (activeCycles.get(key) === cycle) activeCycles.delete(key);
  }
}
