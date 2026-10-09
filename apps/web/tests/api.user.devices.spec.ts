import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireUserId: vi.fn(), findMany: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUserId: mocks.requireUserId }));
vi.mock('@/server/prisma', () => ({ prisma: { device: { findMany: mocks.findMany } } }));
import { GET } from '@/app/api/user/devices/route';

describe('DEVICE-LIST: authenticated owner-scoped device listing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireUserId.mockResolvedValue('owner');
    mocks.findMany.mockResolvedValue([]);
  });

  it('lists only devices owned by the authenticated user', async () => {
    mocks.findMany.mockResolvedValue([{ deviceId: 'd1', name: 'Phone', activePrefix: 'ABC', createdAt: new Date('2026-01-01'), lastUsedAt: new Date('2026-01-02') }]);
    const res = await GET(new Request('http://localhost/api/user/devices'));
    expect(res.status).toBe(200);
    expect((await res.json()).devices).toHaveLength(1);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId: 'owner' },
      orderBy: { lastUsedAt: 'desc' },
      select: { deviceId: true, name: true, activePrefix: true, createdAt: true, lastUsedAt: true },
    });
  });

  it('returns an empty array for a user with no devices', async () => {
    const res = await GET(new Request('http://localhost/api/user/devices'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ devices: [] });
  });

  it('rejects unauthenticated requests', async () => {
    mocks.requireUserId.mockRejectedValue(new Error('UNAUTHORIZED'));
    expect((await GET(new Request('http://localhost/api/user/devices'))).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('returns 500 on database failures', async () => {
    mocks.findMany.mockRejectedValue(new Error('db error'));
    expect((await GET(new Request('http://localhost/api/user/devices'))).status).toBe(500);
  });
});
