import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireUserId: vi.fn(), updateMany: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUserId: mocks.requireUserId }));
vi.mock('@/server/prisma', () => ({ prisma: { device: { updateMany: mocks.updateMany } } }));

import { PUT } from '@/app/api/user/devices/name/route';

function request(body: unknown) {
  return new Request('http://localhost/api/user/devices/name', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('DEVICE-NAME: authenticated device-scoped rename', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireUserId.mockResolvedValue('owner');
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it('updates only a device belonging to the authenticated user', async () => {
    const res = await PUT(request({ deviceId: 'device-1', deviceName: 'Phone', userId: 'other' }));
    expect(res.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: 'owner', deviceId: 'device-1' },
      data: { name: 'Phone' },
    });
  });

  it('returns 401 without a session', async () => {
    mocks.requireUserId.mockRejectedValue(new Error('UNAUTHORIZED'));
    expect((await PUT(request({ deviceId: 'd', deviceName: 'Phone' }))).status).toBe(401);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid identifiers and names', async () => {
    for (const body of [{ deviceName: 'Phone' }, { deviceId: 'd', deviceName: 4 }, { deviceId: ' ', deviceName: 'Phone' }]) {
      expect((await PUT(request(body))).status).toBe(400);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the device does not belong to this user', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await PUT(request({ deviceId: 'other-device', deviceName: 'Phone' }))).status).toBe(404);
  });

  it('returns 500 for database errors', async () => {
    mocks.updateMany.mockRejectedValue(new Error('db failure'));
    expect((await PUT(request({ deviceId: 'd', deviceName: 'Phone' }))).status).toBe(500);
  });
});
