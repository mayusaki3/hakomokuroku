import type { Prisma, SyncChangeLog } from '@prisma/client';
import { prisma } from '@/server/prisma';

export const MAX_PULL_LIMIT = 200;
const MAX_INT64 = 9223372036854775807n;

export class PullV2Error extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

export function parsePullCursor(value: string | null): bigint {
  if (value === null) throw new PullV2Error('FULL_RESYNC_REQUIRED', 409);
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new PullV2Error('INVALID_CURSOR', 400);
  const cursor = BigInt(value);
  if (cursor > MAX_INT64) throw new PullV2Error('INVALID_CURSOR', 400);
  return cursor;
}

export function parsePullLimit(value: string | null): number {
  if (value === null) return 100;
  if (!/^[1-9][0-9]*$/.test(value)) throw new PullV2Error('INVALID_LIMIT', 400);
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit > MAX_PULL_LIMIT) {
    throw new PullV2Error('INVALID_LIMIT', 400);
  }
  return limit;
}

export function serializePullChange(log: SyncChangeLog) {
  if (!log.payload || typeof log.payload !== 'object' || Array.isArray(log.payload)) {
    throw new Error('INVALID_SYNC_SNAPSHOT');
  }
  const payload = log.payload as Prisma.JsonObject;
  if (payload.id !== log.entityId) throw new Error('INVALID_SYNC_SNAPSHOT');
  return {
    entityType: log.entityType,
    entityId: log.entityId,
    syncSeq: log.syncSeq.toString(),
    record: {
      ...payload,
      id: log.entityId,
      revision: log.revision.toString(),
      contentHash: log.contentHash,
      syncSeq: log.syncSeq.toString(),
    },
  };
}

export async function readPullPage(userId: string, cursor: bigint, limit: number) {
  // Snapshot the high-water mark so a page never claims changes committed later.
  // Global sequence gaps may belong to other users and must not imply missing history.
  const [sequence, rows] = await prisma.$transaction(async (tx) => {
    const seq = await tx.syncSequence.findFirst({ orderBy: { lastSeq: 'desc' } });
    const upper = seq?.lastSeq ?? 0n;
    if (cursor > upper) throw new PullV2Error('INVALID_CURSOR', 400);
    const changes = await tx.syncChangeLog.findMany({
      where: { userId, syncSeq: { gt: cursor, lte: upper } },
      orderBy: { syncSeq: 'asc' },
      take: limit + 1,
    });
    return [upper, changes] as const;
  });
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  return {
    changes: selected.map(serializePullChange),
    nextCursor: (hasMore ? selected[selected.length - 1].syncSeq : sequence).toString(),
    hasMore,
  };
}
