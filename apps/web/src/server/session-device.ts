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
