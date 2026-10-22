import { prisma } from '@/server/prisma';

export const SYNC_HISTORY_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Explicit maintenance operation; never run implicitly on Pull or app startup.
 * Only a prefix of each user's syncSeq history can be removed. A later expired
 * row must be preserved when an earlier sequence is still within retention.
 */
export async function pruneSyncHistory(now: Date = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error('INVALID_RETENTION_DATE');
  const cutoff = new Date(now.getTime() - SYNC_HISTORY_RETENTION_DAYS * DAY_MS);
  const candidates = await prisma.syncChangeLog.findMany({
    where: { serverUpdatedAt: { lt: cutoff } },
    select: { userId: true },
    distinct: ['userId'],
  });

  let removed = 0;
  let advancedUsers = 0;

  for (const { userId } of candidates) {
    const result = await prisma.$transaction(async (tx) => {
      // The first unexpired row blocks deletion of any later syncSeq, even
      // if those later rows carry an older serverUpdatedAt.
      const firstRetained = await tx.syncChangeLog.findFirst({
        where: { userId, serverUpdatedAt: { gte: cutoff } },
        orderBy: { syncSeq: 'asc' },
        select: { syncSeq: true },
      });
      const lastExpiredPrefix = await tx.syncChangeLog.findFirst({
        where: {
          userId,
          serverUpdatedAt: { lt: cutoff },
          ...(firstRetained ? { syncSeq: { lt: firstRetained.syncSeq } } : {}),
        },
        orderBy: { syncSeq: 'desc' },
        select: { syncSeq: true },
      });
      if (!lastExpiredPrefix) return { count: 0, advanced: false };

      const previous = await tx.syncHistoryBoundary.findUnique({
        where: { userId },
        select: { minValidCursor: true },
      });
      const nextCursor = lastExpiredPrefix.syncSeq > (previous?.minValidCursor ?? 0n)
        ? lastExpiredPrefix.syncSeq
        : (previous?.minValidCursor ?? 0n);

      // The boundary must be committed atomically with deletion: a Pull
      // cannot observe deleted rows while still accepting an older cursor.
      await tx.syncHistoryBoundary.upsert({
        where: { userId },
        create: { userId, minValidCursor: nextCursor },
        update: { minValidCursor: nextCursor },
      });
      const deleted = await tx.syncChangeLog.deleteMany({
        where: { userId, syncSeq: { lte: lastExpiredPrefix.syncSeq }, serverUpdatedAt: { lt: cutoff } },
      });
      return { count: deleted.count, advanced: nextCursor > (previous?.minValidCursor ?? 0n) };
    });
    removed += result.count;
    if (result.advanced) advancedUsers += 1;
  }

  return { cutoff: cutoff.toISOString(), removed, advancedUsers };
}
