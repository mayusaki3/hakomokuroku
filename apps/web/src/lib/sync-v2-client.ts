import type { UserLocalDB } from '@/lib/user-local-db';
import { applyPullPage, type PullPage } from '@/lib/local-sync-pull';
import { FullResyncHttpError, runFullResync, type FullResyncTransportOptions } from '@/lib/full-resync-client';

export interface SyncV2Options extends FullResyncTransportOptions {
  pullLimit?: number;
  maxPullPages?: number;
}

export interface SyncV2Result {
  resynced: boolean;
  pulledPages: number;
  appliedChanges: number;
}

function parsePage(body: unknown): PullPage & { hasMore: boolean } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_PULL_RESPONSE');
  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.changes) || typeof value.nextCursor !== 'string' ||
      !/^(0|[1-9][0-9]*)$/.test(value.nextCursor) ||
      BigInt(value.nextCursor) > 9223372036854775807n ||
      typeof value.hasMore !== 'boolean') throw new Error('INVALID_PULL_RESPONSE');
  return value as unknown as PullPage & { hasMore: boolean };
}

function pullEndpoint(baseUrl: string, cursor: string, limit: number): string {
  return baseUrl.replace(/\/$/, '') + '/api/sync/v2/pull?cursor=' +
    encodeURIComponent(cursor) + '&limit=' + limit;
}

/**
 * Pull-only v0.8 coordinator. Full Resync is required for an absent cursor,
 * a retained staging session, or an HTTP 409 FULL_RESYNC_REQUIRED response.
 * Network requests never run inside IndexedDB transactions.
 * Outbox push/conflict resolution is deliberately separate.
 */
export async function runSyncV2Pull(db: UserLocalDB, options: SyncV2Options = {}): Promise<SyncV2Result> {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = options.baseUrl ?? '';
  const limit = options.pullLimit ?? 100;
  const maxPages = options.maxPullPages ?? 1000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('INVALID_PULL_LIMIT');
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error('INVALID_PULL_PAGE_BUDGET');

  await db.initializeSyncState();
  let resynced = false;
  let pages = 0;
  let applied = 0;
  let resyncAttempts = 0;

  while (pages < maxPages) {
    const state = await db.syncState.get('SYNC');
    if (!state) throw new Error('SYNC_STATE_MISSING');
    const staging = await db.resyncStage.get('STAGE');
    if (staging || state.pullCursor === null) {
      if (++resyncAttempts > 2) throw new Error('RESYNC_RETRY_EXCEEDED');
      await runFullResync(db, options);
      resynced = true;
      continue;
    }

    const response = await fetcher(pullEndpoint(baseUrl, state.pullCursor, limit), {
      method: 'GET', credentials: 'include', cache: 'no-store', signal: options.signal,
    });
    if (!response.ok) {
      let code: string | undefined;
      try {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && 'error' in body &&
            typeof body.error === 'string') code = body.error;
      } catch { /* Use HTTP status if the body is malformed. */ }
      if (response.status === 409 && code === 'FULL_RESYNC_REQUIRED') {
        if (++resyncAttempts > 2) throw new Error('RESYNC_RETRY_EXCEEDED');
        await runFullResync(db, options);
        resynced = true;
        continue;
      }
      throw new FullResyncHttpError(response.status, code ?? 'HTTP_' + response.status);
    }

    const page = parsePage(await response.json() as unknown);
    if (page.hasMore && (page.changes.length === 0 || page.nextCursor === state.pullCursor)) {
      throw new Error('PULL_PAGE_NO_PROGRESS');
    }
    applied += await applyPullPage(db, page);
    pages++;
    if (!page.hasMore) return { resynced, pulledPages: pages, appliedChanges: applied };
  }
  throw new Error('PULL_PAGE_BUDGET_EXCEEDED');
}
