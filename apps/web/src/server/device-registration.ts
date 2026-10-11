import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '@/server/prisma';
import { createDeviceCredential, hashDeviceCredential, verifyDeviceCredential } from '@/server/device-credential';

/**
 * Call only after full user authentication (including MFA when required).
 * A public deviceId never proves device ownership.
 */
export async function registerOrResumeDevice(
  userId: string,
  deviceId?: string,
  credential?: string,
): Promise<{ deviceId: string; credential: string; created: boolean }> {
  if (deviceId && credential) {
    const existing = await prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
      select: { credentialHash: true },
    });
    if (existing?.credentialHash && verifyDeviceCredential(credential, existing.credentialHash)) {
      const updated = await prisma.device.updateMany({
        where: { userId, deviceId, credentialHash: existing.credentialHash },
        data: { lastUsedAt: new Date() },
      });
      if (updated.count === 1) return { deviceId, credential, created: false };
    }
  }

  // Prefix uniqueness is scoped to a user; retry on rare collisions.
  for (let attempt = 0; attempt < 5; attempt++) {
    const newDeviceId = randomUUID();
    const newCredential = createDeviceCredential();
    const prefix = randomBytes(8).toString('hex');
    const now = new Date();
    const collision = await prisma.devicePrefix.findUnique({
      where: { userId_prefix: { userId, prefix } },
      select: { prefix: true },
    });
    if (collision) continue;
    try {
      await prisma.$transaction(async tx => {
        await tx.device.create({
          data: {
            userId, deviceId: newDeviceId, credentialHash: hashDeviceCredential(newCredential),
            activePrefix: prefix, createdAt: now, lastUsedAt: now,
          },
        });
        await tx.devicePrefix.create({
          data: { userId, deviceId: newDeviceId, prefix, allocatedAt: now, activatedAt: now },
        });
      });
      return { deviceId: newDeviceId, credential: newCredential, created: true };
    } catch (error) {
      // Do not hide unexpected database errors or retry on arbitrary failures.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') continue;
      throw error;
    }
  }
  throw new Error('DEVICE_REGISTRATION_COLLISION');
}
