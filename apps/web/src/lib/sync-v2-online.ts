import type { UserLocalDB } from '@/lib/user-local-db';
import { runSyncV2Cycle, type SyncV2CycleOptions, type SyncV2CycleResult } from '@/lib/sync-v2-cycle';

export interface OnlineSyncTarget {
  addEventListener(type: 'online', listener: () => void): void;
  removeEventListener(type: 'online', listener: () => void): void;
}

/**
 * Attach reconnect-triggered synchronization after authentication.
 * The caller owns the DB and must dispose this listener on logout/unmount.
 * The cycle itself performs Pull (or Full Resync) before any Push.
 *
 * No local editing is blocked; only server synchronization is serialized.
 */
export function attachOnlineSync(
  db: UserLocalDB,
  options: SyncV2CycleOptions & {
    target?: OnlineSyncTarget;
    onSuccess?: (result: SyncV2CycleResult) => void;
    onError?: (error: unknown) => void;
  } = {},
): () => void {
  const target = options.target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!target) return () => {};
  let disposed = false;
  const onOnline = () => {
    if (disposed) return;
    // Avoid an unhandled rejection from an event listener. Reconnection
    // events can repeat; runSyncV2Cycle coalesces concurrent attempts.
    void runSyncV2Cycle(db, options).then(
      result => { if (!disposed) options.onSuccess?.(result); },
      error => { if (!disposed) options.onError?.(error); },
    );
  };
  target.addEventListener('online', onOnline);
  return () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('online', onOnline);
  };
}
