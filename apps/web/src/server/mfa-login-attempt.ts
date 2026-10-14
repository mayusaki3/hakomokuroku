import { prisma } from '@/server/prisma';

const MAX_FAILURES = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export async function isMfaLoginLocked(userId: string, now = new Date()): Promise<boolean> {
  const attempt = await prisma.mfaLoginAttempt.findUnique({ where: { userId } });
  return attempt?.lockedUntil != null && attempt.lockedUntil > now;
}

export async function recordMfaLoginFailure(userId: string, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.mfaLoginAttempt.upsert({
      where: { userId },
      create: { userId, failCount: 0 },
      update: {},
    });
    const current = await tx.mfaLoginAttempt.findUniqueOrThrow({ where: { userId } });
    if (current.lockedUntil && current.lockedUntil > now) return true;
    if (current.lockedUntil && current.lockedUntil <= now) {
      await tx.mfaLoginAttempt.update({ where: { userId }, data: { failCount: 0, lockedUntil: null } });
    }
    const updated = await tx.mfaLoginAttempt.update({
      where: { userId },
      data: { failCount: { increment: 1 } },
    });
    if (updated.failCount >= MAX_FAILURES) {
      await tx.mfaLoginAttempt.update({
        where: { userId },
        data: { lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) },
      });
      return true;
    }
    return false;
  });
}
