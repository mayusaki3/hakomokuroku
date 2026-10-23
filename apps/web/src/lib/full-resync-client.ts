import type { UserLocalDB } from '@/lib/user-local-db';
import {
  beginFullResync, commitFullResync, stageFullResyncPage,
  type FullResyncPage,
} from '@/lib/local-full-resync';

export interface FullResyncTransportOptions {
  /** Same-origin API base, or a configured server origin. */
  baseUrl?: string;
  fetcher?: typeof fetch;
  pageLimit?: number;
  signal?: AbortSignal;
}

interface CreatedSnapshot {
  snapshotId: string;
  snapshotSeq: string;
  total: number;
  expiresAt: string;
}

function endpoint(baseUrl: string, suffix: string): string {
  return baseUrl.replace(/\/$/, '') + '/api/sync/v2/full-resync' + suffix;
}

async function requestJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, { ...init, credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    let code = 'HTTP_' + response.status;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        code = body.error;
      }
    } catch { /* Preserve HTTP status on malformed error responses. */ }
    throw new FullResyncHttpError(response.status, code);
  }
  return response.json() as Promise<unknown>;
}

export class FullResyncHttpError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validSequence(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) &&
    BigInt(value) <= 9223372036854775807n;
}
function created(value: unknown): CreatedSnapshot {
  if (!isObject(value) || typeof value.snapshotId !== 'string' || !value.snapshotId ||
      !validSequence(value.snapshotSeq) || !Number.isSafeInteger(value.total) ||
      (value.total as number) < 0 || typeof value.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(value.expiresAt))) {
    throw new Error('INVALID_RESYNC_CREATE_RESPONSE');
  }
  return value as unknown as CreatedSnapshot;
}
function page(value: unknown): FullResyncPage {
  if (!isObject(value) || typeof value.snapshotId !== 'string' ||
      !validSequence(value.snapshotSeq) || !Array.isArray(value.entities) ||
      !Number.isSafeInteger(value.nextOffset) || (value.nextOffset as number) < 0 ||
      typeof value.hasMore !== 'boolean') {
    throw new Error('INVALID_RESYNC_PAGE_RESPONSE');
  }
  return value as unknown as FullResyncPage;
}

/**
 * Fetch and adopt a complete server snapshot. On transient failure the staging
 * session is retained and the next invocation resumes from its durable offset.
 * Expired or missing snapshots are replaced with a fresh snapshot; current
 * Business and Outbox are never touched until commitFullResync succeeds.
 */
export async function runFullResync(db: UserLocalDB, options: FullResyncTransportOptions = {}): Promise<number> {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = options.baseUrl ?? '';
  const limit = options.pageLimit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('INVALID_RESYNC_LIMIT');
  await db.initializeSyncState();

  let stage = await db.resyncStage.get('STAGE');
  if (!stage) {
    const snapshot = created(await requestJson(fetcher, endpoint(baseUrl, ''), {
      method: 'POST', signal: options.signal,
    }));
    await beginFullResync(db, snapshot.snapshotId, snapshot.snapshotSeq, snapshot.total);
    stage = await db.resyncStage.get('STAGE');
  }
  if (!stage) throw new Error('RESYNC_STAGE_MISSING');
  if (stage.expectedTotal === undefined) throw new Error('RESYNC_TOTAL_UNKNOWN');

  // A completed staging session may have been interrupted before adoption.
  while (!stage.complete) {
    const query = '?offset=' + stage.nextOffset + '&limit=' + limit;
    let next: FullResyncPage;
    try {
      next = page(await requestJson(fetcher, endpoint(baseUrl, '/' + encodeURIComponent(stage.snapshotId) + query), {
        method: 'GET', signal: options.signal,
      }));
    } catch (error) {
      if (error instanceof FullResyncHttpError &&
          (error.code === 'SNAPSHOT_EXPIRED' || error.code === 'SNAPSHOT_NOT_FOUND')) {
        // Invalidate the old staging data and obtain a fresh consistent snapshot
        // on the next invocation; do not retry forever inside this call.
        await db.transaction('rw', db.resyncStage, db.resyncEntities, async () => {
          await db.resyncEntities.clear();
          await db.resyncStage.delete('STAGE');
        });
      }
      throw error;
    }
    await stageFullResyncPage(db, next);
    stage = (await db.resyncStage.get('STAGE'))!;
  }
  const expectedTotal = stage.expectedTotal;
  if (expectedTotal === undefined) throw new Error('RESYNC_TOTAL_UNKNOWN');
  await commitFullResync(db, stage.snapshotId, expectedTotal);
  return stage.nextOffset;
}
