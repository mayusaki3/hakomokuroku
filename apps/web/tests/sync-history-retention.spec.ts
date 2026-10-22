import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findCandidates, transaction } = vi.hoisted(() => ({
  findCandidates: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/server/prisma', () => ({
  prisma: { syncChangeLog: { findMany: findCandidates }, $transaction: transaction },
}));
import { pruneSyncHistory } from '@/server/sync-history-retention';

const now = new Date('2026-10-22T00:00:00.000Z');

beforeEach(() => vi.resetAllMocks());

function mockTransaction(options: {
  firstRetained?: bigint | null;
  lastExpired?: bigint | null;
  previous?: bigint | null;
  deleted?: number;
}) {
  const upsert = vi.fn().mockResolvedValue({});
  const deleteMany = vi.fn().mockResolvedValue({ count: options.deleted ?? 1 });
  const findFirst = vi.fn().mockImplementation(({ orderBy }: { orderBy: { syncSeq: 'asc' | 'desc' } }) => {
    if (orderBy.syncSeq === 'desc') {
      return options.lastExpired == null ? null : { syncSeq: options.lastExpired };
    }
    return options.firstRetained == null ? null : { syncSeq: options.firstRetained };
  });
  const findUnique = vi.fn().mockResolvedValue(
    options.previous == null ? null : { minValidCursor: options.previous },
  );
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      syncChangeLog: { findFirst, deleteMany },
      syncHistoryBoundary: { findUnique, upsert },
    }),
  );
  return { findFirst, findUnique, upsert, deleteMany };
}

describe('90-day sync history retention', () => {
  it('does nothing when no expired users exist', async () => {
    findCandidates.mockResolvedValue([]);
    expect(await pruneSyncHistory(now)).toEqual({
      cutoff: '2026-07-24T00:00:00.000Z', removed: 0, advancedUsers: 0,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('advances boundary and deletes only the expired prefix in one transaction', async () => {
    findCandidates.mockResolvedValue([{ userId: 'u1' }]);
    const tx = mockTransaction({ firstRetained: 8n, lastExpired: 5n, deleted: 2 });
    expect(await pruneSyncHistory(now)).toMatchObject({ removed: 2, advancedUsers: 1 });
    expect(tx.findFirst).toHaveBeenNthCalledWith(2, {
      where: { userId: 'u1', serverUpdatedAt: { lt: new Date('2026-07-24T00:00:00.000Z') }, syncSeq: { lt: 8n } },
      orderBy: { syncSeq: 'desc' }, select: { syncSeq: true },
    });
    expect(tx.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', minValidCursor: 5n },
      update: { minValidCursor: 5n },
    });
    expect(tx.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', syncSeq: { lte: 5n }, serverUpdatedAt: { lt: new Date('2026-07-24T00:00:00.000Z') } },
    });
    expect(tx.upsert.mock.invocationCallOrder[0]).toBeLessThan(tx.deleteMany.mock.invocationCallOrder[0]);
  });

  it('preserves later expired rows when an earlier row is unexpired', async () => {
    findCandidates.mockResolvedValue([{ userId: 'u1' }]);
    const tx = mockTransaction({ firstRetained: 3n, lastExpired: null });
    expect(await pruneSyncHistory(now)).toMatchObject({ removed: 0, advancedUsers: 0 });
    expect(tx.upsert).not.toHaveBeenCalled();
    expect(tx.deleteMany).not.toHaveBeenCalled();
  });

  it('never moves an existing boundary backwards', async () => {
    findCandidates.mockResolvedValue([{ userId: 'u1' }]);
    const tx = mockTransaction({ lastExpired: 5n, previous: 9n });
    expect(await pruneSyncHistory(now)).toMatchObject({ advancedUsers: 0 });
    expect(tx.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', minValidCursor: 9n },
      update: { minValidCursor: 9n },
    });
  });

  it('handles users independently', async () => {
    findCandidates.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    const tx = mockTransaction({ lastExpired: 4n });
    expect(await pruneSyncHistory(now)).toMatchObject({ removed: 2, advancedUsers: 2 });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(tx.upsert).toHaveBeenNthCalledWith(2, {
      where: { userId: 'u2' },
      create: { userId: 'u2', minValidCursor: 4n },
      update: { minValidCursor: 4n },
    });
  });

  it('rejects invalid dates without accessing the database', async () => {
    await expect(pruneSyncHistory(new Date(NaN))).rejects.toThrow('INVALID_RETENTION_DATE');
    expect(findCandidates).not.toHaveBeenCalled();
  });
});
