'use client';

import { useEffect } from 'react';
import { openSyncV2Session } from '@/lib/sync-v2-session';
import { runSyncV2Cycle } from '@/lib/sync-v2-cycle';

/**
 * Bind Sync v2 to the server-verified AuthSession, never to localStorage tokens.
 * Local edits remain available while the network or a Full Resync is busy.
 */
export default function SyncV2Runtime() {
  useEffect(() => {
    let stopped = false;
    let generation = 0;
    let current: { userId: string; dispose: () => void } | null = null;
    let checkInFlight: Promise<void> | null = null;

    const clear = () => {
      generation++;
      current?.dispose();
      current = null;
    };

    const check = (): Promise<void> => {
      if (checkInFlight) return checkInFlight;
      const requestedGeneration = generation;
      const task = (async () => {
        const response = await fetch('/api/auth/me', {
          credentials: 'include', cache: 'no-store',
          headers: { accept: 'application/json' },
        });
        // Transient network/server failures must not destroy an offline session.
        if (!response.ok) return;
        const body = await response.json() as { user?: { id?: unknown } | null };
        if (stopped || generation !== requestedGeneration) return;
        const userId = typeof body.user?.id === 'string' ? body.user.id : null;
        if (!userId) { clear(); return; }
        if (current?.userId === userId) return;

        clear();
        const version = generation;
        const session = await openSyncV2Session(userId, {
          onError: error => console.warn('Sync v2 reconnect failed', error),
        });
        if (stopped || generation !== version) {
          session.dispose();
          return;
        }
        current = { userId, dispose: session.dispose };
        // Initial synchronization is best-effort. Online events retry later.
        if (navigator.onLine) {
          void runSyncV2Cycle(session.db).catch(error => {
            if (!stopped && generation === version) {
              console.warn('Sync v2 initial cycle failed', error);
            }
          });
        }
      })().catch(error => {
        if (!stopped) console.warn('Sync v2 session check failed', error);
      }).finally(() => {
        if (checkInFlight === task) checkInFlight = null;
      });
      checkInFlight = task;
      return task;
    };

    const onChanged = () => { void check(); };
    const onLogout = () => { clear(); };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('hk:me:changed', onChanged);
    window.addEventListener('hk:logged-out', onLogout);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => { void check(); }, 30000);
    void check();
    return () => {
      stopped = true;
      clear();
      window.clearInterval(interval);
      window.removeEventListener('hk:me:changed', onChanged);
      window.removeEventListener('hk:logged-out', onLogout);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
