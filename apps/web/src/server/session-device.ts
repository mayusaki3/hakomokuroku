import { prisma } from '@/server/prisma';

/**
 * Associate an existing session with a registered device owned by the same user.
 * The caller must already have authenticated both the session and device identity.
 * This function does not accept an unverified device identifier as proof of ownership.
 */
export async function bindSessionDevice(userId: string, sessionId: string, deviceId: string) {
  return prisma.$transaction(async (tx) => {
    const device = await tx.device.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
      select: { deviceId: true },
    });
    if (!device) return false;
    const updated = await tx.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { deviceId },
    });
    return updated.count === 1;
  });
}

/**
 * Detach sessions before removing a registered device.
 * Session tokens remain valid; removing a device is not a logout operation.
 * Caller must authorize the device removal for this user.
 */
export async function detachDeviceSessions(userId: string, deviceId: string) {
  return prisma.authSession.updateMany({
    where: { userId, deviceId },
    data: { deviceId: null },
  });
}

/**
 * Remove a registered device without revoking its authentication sessions.
 * Both detachment and deletion are atomic and scoped to the authenticated user.
 * Call only after the user's authorization to remove the device.
 */
export async function removeRegisteredDevice(userId: string, deviceId: string) {
  return prisma.$transaction(async (tx) => {
    const device = await tx.device.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
      select: { deviceId: true },
    });
    if (!device) return false;
    await tx.authSession.updateMany({
      where: { userId, deviceId },
      data: { deviceId: null },
    });
    const deleted = await tx.device.deleteMany({
      where: { userId, deviceId },
    });
    return deleted.count === 1;
  });
}
