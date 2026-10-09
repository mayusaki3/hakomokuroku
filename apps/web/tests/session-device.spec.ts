import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn(), transaction: vi.fn() }));
vi.mock('@/server/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));
import { bindSessionDevice } from '@/server/session-device';

describe('session-device binding ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ device: { findUnique: mocks.findUnique }, authSession: { updateMany: mocks.updateMany } }));
    mocks.findUnique.mockResolvedValue({ deviceId: 'device-1' });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it('requires a device owned by the authenticated user and scopes the session update', async () => {
    expect(await bindSessionDevice('owner', 'session-1', 'device-1')).toBe(true);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { userId_deviceId: { userId: 'owner', deviceId: 'device-1' } },
      select: { deviceId: true },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', userId: 'owner', revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { deviceId: 'device-1' },
    });
  });

  it('does not update a session for an unknown or foreign device', async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await bindSessionDevice('owner', 'session-1', 'foreign-device')).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('does not bind a missing, revoked, expired or foreign session', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await bindSessionDevice('owner', 'session-1', 'device-1')).toBe(false);
  });
});
