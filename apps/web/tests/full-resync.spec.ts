import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireUserId, createSnapshot, readPage } = vi.hoisted(() => ({
  requireUserId: vi.fn(), createSnapshot: vi.fn(), readPage: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ requireUserId }));
vi.mock('@/server/full-resync', async importOriginal => {
  const original = await importOriginal<typeof import('@/server/full-resync')>();
  return { ...original, createFullResyncSnapshot: createSnapshot, readFullResyncPage: readPage };
});
import { POST } from '@/app/api/sync/v2/full-resync/route';
import { GET } from '@/app/api/sync/v2/full-resync/[snapshotId]/route';
import { FullResyncError, parseSnapshotLimit, parseSnapshotOffset } from '@/server/full-resync';

beforeEach(() => {
  vi.resetAllMocks();
  requireUserId.mockResolvedValue('u1');
});

describe('full resync HTTP boundary', () => {
  it('rejects unauthenticated snapshot creation', async () => {
    requireUserId.mockRejectedValue(new Error('UNAUTHORIZED'));
    expect((await POST(new Request('http://localhost/api/sync/v2/full-resync'))).status).toBe(401);
    expect(createSnapshot).not.toHaveBeenCalled();
  });
  it('uses the authenticated user for snapshot creation', async () => {
    createSnapshot.mockResolvedValue({ snapshotId: 's1', snapshotSeq: '5', total: 2 });
    const response = await POST(new Request('http://localhost/api/sync/v2/full-resync'));
    expect(response.status).toBe(201);
    expect(createSnapshot).toHaveBeenCalledWith('u1');
    expect((await response.json()).snapshotId).toBe('s1');
  });
  it('validates pagination before querying', async () => {
    expect(() => parseSnapshotOffset('-1')).toThrow('INVALID_OFFSET');
    expect(() => parseSnapshotOffset('9007199254740992')).toThrow('INVALID_OFFSET');
    expect(() => parseSnapshotLimit('201')).toThrow('INVALID_LIMIT');
    const response = await GET(new Request('http://localhost/?offset=-1'), { params: { snapshotId: 's1' } });
    expect(response.status).toBe(400);
    expect(readPage).not.toHaveBeenCalled();
  });
  it('scopes page requests to the authenticated user', async () => {
    readPage.mockResolvedValue({ snapshotId: 's1', snapshotSeq: '5', entities: [], nextOffset: 10, hasMore: false });
    const response = await GET(new Request('http://localhost/?offset=10&limit=20'), { params: { snapshotId: 's1' } });
    expect(response.status).toBe(200);
    expect(readPage).toHaveBeenCalledWith('u1', 's1', 10, 20);
  });
  it('propagates missing or expired snapshot errors', async () => {
    readPage.mockRejectedValue(new FullResyncError('SNAPSHOT_EXPIRED', 410));
    const response = await GET(new Request('http://localhost/'), { params: { snapshotId: 's1' } });
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'SNAPSHOT_EXPIRED' });
  });
});
