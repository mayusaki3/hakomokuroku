import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

if (!/^file:\.\/auth-migration-existing-test\.db$/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Use scripts/test-auth-session-migration.ps1 with its isolated test database');
}

const prisma = new PrismaClient();

describe('Existing AuthSession SQLite migration', () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('preserves both users and their original sessions with null device links', async () => {
    const sessions = await prisma.authSession.findMany({
      where: { id: { in: ['migration-session-a', 'migration-session-b'] } },
      orderBy: { id: 'asc' },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => [s.userId, s.tokenHash, s.deviceId])).toEqual([
      ['migration-user-a', 'migration-token-a', null],
      ['migration-user-b', 'migration-token-b', null],
    ]);
  });

  it('allows a matching device and rejects a foreign device', async () => {
    await prisma.authSession.update({
      where: { id: 'migration-session-a' },
      data: { deviceId: 'device-a' },
    });
    await expect(prisma.authSession.update({
      where: { id: 'migration-session-a' },
      data: { deviceId: 'device-b' },
    })).rejects.toThrow();
    const session = await prisma.authSession.findUniqueOrThrow({ where: { id: 'migration-session-a' } });
    expect(session.deviceId).toBe('device-a');
  });

  it('blocks deletion of a linked device and preserves the session', async () => {
    await prisma.authSession.update({
      where: { id: 'migration-session-a' },
      data: { deviceId: 'device-a' },
    });
    await expect(prisma.device.delete({
      where: { userId_deviceId: { userId: 'migration-user-a', deviceId: 'device-a' } },
    })).rejects.toThrow();
    expect(await prisma.authSession.count({ where: { id: 'migration-session-a' } })).toBe(1);
  });

  it('passes SQLite foreign key integrity checks', async () => {
    const violations = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>('PRAGMA foreign_key_check');
    expect(violations).toEqual([]);
  });
});
