import { UserLocalDB } from '@/lib/user-local-db';
import { attachOnlineSync, type OnlineSyncTarget } from '@/lib/sync-v2-online';
import type { SyncV2CycleOptions, SyncV2CycleResult } from '@/lib/sync-v2-cycle';

export interface SyncV2SessionOptions extends SyncV2CycleOptions {
  target?: OnlineSyncTarget;
  onSuccess?: (result: SyncV2CycleResult) => void;
  onError?: (error: unknown) => void;
}

/**
 * Owns the authenticated user's IndexedDB and reconnect listener.
 * Call dispose on logout or when replacing the authenticated user.
 * The database is not deleted: offline edits must survive logout/relogin.
 */
export async function openSyncV2Session(
  userId: string,
  options: SyncV2SessionOptions = {},
): Promise<{ db: UserLocalDB; dispose: () => void }> {
  if (!userId.trim()) throw new Error('Authenticated User.id is required');
  const db = new UserLocalDB(userId);
  const controller = new AbortController();
  const { signal: upstreamSignal, ...rest } = options;
  if (upstreamSignal?.aborted) controller.abort(upstreamSignal.reason);
  const onUpstreamAbort = () => controller.abort(upstreamSignal?.reason);
  upstreamSignal?.addEventListener('abort', onUpstreamAbort, { once: true });
  try {
    await db.open();
    await db.initializeSyncState();
    const detach = attachOnlineSync(db, { ...rest, signal: controller.signal });
    let disposed = false;
    return {
      db,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        detach();
        controller.abort(new Error('SYNC_SESSION_DISPOSED'));
        upstreamSignal?.removeEventListener('abort', onUpstreamAbort);
        // Abort fetch requests and close the DB without deleting offline edits.
        // Already-committed server writes may still require receipt reconciliation.
        db.close();
      },
    };
  } catch (error) {
    controller.abort();
    upstreamSignal?.removeEventListener('abort', onUpstreamAbort);
    db.close();
    throw error;
  }
}
