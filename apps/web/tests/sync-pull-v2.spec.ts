import { describe, expect, it, vi, beforeEach } from 'vitest';

const { requireUserId, transaction } = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ requireUserId }));
vi.mock('@/server/prisma', () => ({ prisma: { $transaction: transaction } }));

import { GET } from '@/app/api/sync/v2/pull/route';
import { parsePullCursor, parsePullLimit, readPullPage } from '@/server/sync-pull-v2';

const stamp = new Date('2026-10-22T00:00:00.000Z');
function change(seq: bigint, userId = 'u1') {
  return {
    syncSeq: seq, userId, entityType: 'BOX', entityId: 'b',
    revision: 1n, contentHash: 'hash', deleted: false,
    payload: { id: 'b', code: 'B', name: 'Box', updatedAt: stamp.toISOString(), deletedAt: null },
    serverUpdatedAt: stamp,
  };
}
const url = (cursor?: string, limit?: string) =>
  new Request('http://localhost/api/sync/v2/pull?' +
    new URLSearchParams({ ...(cursor === undefined ? {} : { cursor }), ...(limit === undefined ? {} : { limit }) }));

beforeEach(() => {
  vi.resetAllMocks();
  requireUserId.mockResolvedValue('u1');
});

describe('v0.8 server Pull API', () => {
  it('rejects absent and invalid cursors without reading changes', async () => {
    expect(parsePullCursor('9007199254740993')).toBe(9007199254740993n);
    expect(() => parsePullCursor('-1')).toThrow('INVALID_CURSOR');
    expect(() => parsePullCursor('9223372036854775808')).toThrow('INVALID_CURSOR');
    expect(() => parsePullLimit('201')).toThrow('INVALID_LIMIT');
    expect((await GET(url())).status).toBe(409);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated requests', async () => {
    requireUserId.mockRejectedValue(new Error('UNAUTHORIZED'));
    const response = await GET(url('0'));
    expect(response.status).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('scopes rows to the authenticated user and advances to high-water mark', async () => {
    const findMany = vi.fn().mockResolvedValue([change(3n)]);
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
      syncSequence: { findFirst: vi.fn().mockResolvedValue({ lastSeq: 8n }) },
      syncChangeLog: { findMany },
    }));
    const response = await GET(url('0'));
    expect(response.status).toBe(200);
    const page = await response.json();
    expect(page.nextCursor).toBe('8');
    expect(page.hasMore).toBe(false);
    expect(page.changes[0].syncSeq).toBe('3');
    expect(page.changes[0].record.revision).toBe('1');
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', syncSeq: { gt: 0n, lte: 8n } },
      orderBy: { syncSeq: 'asc' }, take: 101,
    });
  });
  it('pages without skipping rows', async () => {
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
      syncSequence: { findFirst: vi.fn().mockResolvedValue({ lastSeq: 9n }) },
      syncChangeLog: { findMany: vi.fn().mockResolvedValue([change(3n), change(7n)]) },
    }));
    const page = await readPullPage('u1', 0n, 1);
    expect(page.nextCursor).toBe('3');
    expect(page.hasMore).toBe(true);
    expect(page.changes).toHaveLength(1);
  });
  it('rejects future cursors', async () => {
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
      syncSequence: { findFirst: vi.fn().mockResolvedValue({ lastSeq: 9n }) },
    }));
    expect((await GET(url('10'))).status).toBe(400);
  });
});
