import type { UserLocalDB } from '@/lib/user-local-db';
import { runSyncV2Pull, type SyncV2Options, type SyncV2Result } from '@/lib/sync-v2-client';
import { runOutboxPush, type PushRunResult } from '@/lib/outbox-push-client';

export interface SyncV2CycleResult {
  beforePush: SyncV2Result;
  push: PushRunResult;
  afterPush: SyncV2Result;
}

/**
 * Complete one synchronization cycle. Pull before Push to detect remote edits;
 * Pull again to observe accepted writes and other devices' intervening changes.
 * No network I/O occurs in an IndexedDB transaction.
 *
 * Do not start overlapping cycles for the same user DB. Callers must serialize
 * cycles; a later revision can otherwise arrive between preflight and Push.
 */
export async function runSyncV2Cycle(
  db: UserLocalDB, options: SyncV2Options = {},
): Promise<SyncV2CycleResult> {
  const beforePush = await runSyncV2Pull(db, options);
  const push = await runOutboxPush(db, options);
  const afterPush = await runSyncV2Pull(db, options);
  return { beforePush, push, afterPush };
}
