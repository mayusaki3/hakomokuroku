import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn(), transaction: vi.fn(), deleteMany: vi.fn() }));
vi.mock('@/server/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    authSession: { updateMany: mocks.updateMany },
  },
}));
import { bindSessionDevice, detachDeviceSessions, removeRegisteredDevice } from '@/server/session-device';

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

describe('session-device detachment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 2 });
  });

  it('clears only links for the specified user and device without revoking sessions', async () => {
    expect(await detachDeviceSessions('owner', 'device-1')).toEqual({ count: 2 });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: 'owner', deviceId: 'device-1' },
      data: { deviceId: null },
    });
  });

  it('is safe when no sessions are associated', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await detachDeviceSessions('owner', 'device-1')).toEqual({ count: 0 });
  });
});

describe('atomic device removal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        device: { findUnique: mocks.findUnique, deleteMany: mocks.deleteMany },
        authSession: { updateMany: mocks.updateMany },
      }));
    mocks.findUnique.mockResolvedValue({ deviceId: 'device-1' });
    mocks.updateMany.mockResolvedValue({ count: 2 });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('detaches sessions before deleting only the owned device', async () => {
    expect(await removeRegisteredDevice('owner', 'device-1')).toBe(true);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { userId_deviceId: { userId: 'owner', deviceId: 'device-1' } },
      select: { deviceId: true },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: 'owner', deviceId: 'device-1' },
      data: { deviceId: null },
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'owner', deviceId: 'device-1' },
    });
    expect(mocks.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deleteMany.mock.invocationCallOrder[0]);
  });

  it('does not detach or delete a missing or foreign device', async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await removeRegisteredDevice('owner', 'foreign')).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates deletion failure so the transaction can roll back', async () => {
    mocks.deleteMany.mockRejectedValue(new Error('database failure'));
    await expect(removeRegisteredDevice('owner', 'device-1')).rejects.toThrow('database failure');
  });
});
