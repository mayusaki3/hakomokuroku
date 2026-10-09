import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { removeRegisteredDevice } from '@/server/session-device';

const dbUrl = process.env.DATABASE_URL ?? '';
if (dbUrl !== 'file:./session-device-integration.db') {
  throw new Error('Use scripts/test-session-device-sqlite.ps1 with its isolated database');
}

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const now = new Date();
const future = new Date('2099-01-01T00:00:00.000Z');
const suffix = randomBytes(6).toString('hex');
const alice = 'session-device-alice-' + suffix;
const bob = 'session-device-bob-' + suffix;

async function session(id: string, userId: string, deviceId: string | null) {
  return prisma.authSession.create({
    data: { id, userId, deviceId, tokenHash: 'test-' + id, expiresAt: future },
  });
}

describe('Device removal SQLite integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (const id of [alice, bob]) {
      await prisma.user.create({ data: { id, userId: id, passwordHash: 'test-only' } });
      await prisma.device.create({
        data: { userId: id, deviceId: 'phone', activePrefix: 'prefix-' + id, createdAt: now, lastUsedAt: now },
      });
      await prisma.devicePrefix.create({
        data: { userId: id, deviceId: 'phone', prefix: 'prefix-' + id, allocatedAt: now, activatedAt: now },
      });
    }
    await session('a1-' + suffix, alice, 'phone');
    await session('a2-' + suffix, alice, 'phone');
    await session('a3-' + suffix, alice, null);
    await session('b1-' + suffix, bob, 'phone');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } });
    await prisma.$disconnect();
  });

  it('removes device and prefixes, detaches sessions without revoking them, and isolates users', async () => {
    expect(await removeRegisteredDevice(alice, 'phone')).toBe(true);
    expect(await prisma.device.count({ where: { userId: alice } })).toBe(0);
    expect(await prisma.devicePrefix.count({ where: { userId: alice } })).toBe(0);
    const sessions = await prisma.authSession.findMany({ where: { userId: alice } });
    expect(sessions).toHaveLength(3);
    expect(sessions.every((s) => s.deviceId === null && s.revokedAt === null && s.expiresAt > now)).toBe(true);
    expect(await prisma.device.count({ where: { userId: bob } })).toBe(1);
    expect(await prisma.devicePrefix.count({ where: { userId: bob } })).toBe(1);
    expect((await prisma.authSession.findUniqueOrThrow({ where: { id: 'b1-' + suffix } })).deviceId).toBe('phone');
  });

  it('does not delete a foreign user device when scoped to another user', async () => {
    const result = await prisma.device.deleteMany({ where: { userId: alice, deviceId: 'phone' } });
    expect(result.count).toBe(0);
    expect(await prisma.device.count({ where: { userId: bob, deviceId: 'phone' } })).toBe(1);
  });
});
