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
  try {
    await db.open();
    await db.initializeSyncState();
    const detach = attachOnlineSync(db, options);
    let disposed = false;
    return {
      db,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        detach();
        // Existing in-flight cycles may still settle. Closing this connection
        // does not delete IndexedDB or cancel network requests.
        db.close();
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
