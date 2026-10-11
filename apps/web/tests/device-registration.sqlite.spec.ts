import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

vi.mock('@/server/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } }) };
});
import { registerOrResumeDevice } from '@/server/device-registration';

if (process.env.DATABASE_URL !== 'file:./device-registration-integration.db') {
  throw new Error('Run with scripts/test-device-registration-sqlite.ps1');
}
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const suffix = randomBytes(6).toString('hex');
const alice = 'device-reg-alice-' + suffix;
const bob = 'device-reg-bob-' + suffix;

describe('Device registration SQLite integration', () => {
  beforeAll(async () => {
    for (const id of [alice, bob]) {
      await prisma.user.create({ data: { id, userId: id, passwordHash: 'test-only' } });
    }
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } });
    await prisma.$disconnect();
  });

  it('registers a device with a hashed credential and an allocated prefix', async () => {
    const result = await registerOrResumeDevice(alice);
    expect(result.created).toBe(true);
    const device = await prisma.device.findUniqueOrThrow({
      where: { userId_deviceId: { userId: alice, deviceId: result.deviceId } },
    });
    expect(device.credentialHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.credential).not.toBe(device.credentialHash);
    expect(await prisma.devicePrefix.count({ where: { userId: alice, deviceId: result.deviceId } })).toBe(1);
  });

  it('resumes only with matching credentials, and never trusts deviceId alone', async () => {
    const first = await registerOrResumeDevice(alice);
    const resumed = await registerOrResumeDevice(alice, first.deviceId, first.credential);
    expect(resumed.created).toBe(false);
    expect(resumed.deviceId).toBe(first.deviceId);
    const untrusted = await registerOrResumeDevice(alice, first.deviceId, 'wrong');
    expect(untrusted.created).toBe(true);
    expect(untrusted.deviceId).not.toBe(first.deviceId);
    const missing = await registerOrResumeDevice(alice, first.deviceId);
    expect(missing.created).toBe(true);
    expect(missing.deviceId).not.toBe(first.deviceId);
  });

  it('does not accept another user device credential', async () => {
    const original = await registerOrResumeDevice(alice);
    const foreign = await registerOrResumeDevice(bob, original.deviceId, original.credential);
    expect(foreign.created).toBe(true);
    expect(foreign.deviceId).not.toBe(original.deviceId);
  });

  it('cannot resume a deleted device', async () => {
    const original = await registerOrResumeDevice(alice);
    await prisma.device.delete({ where: { userId_deviceId: { userId: alice, deviceId: original.deviceId } } });
    const next = await registerOrResumeDevice(alice, original.deviceId, original.credential);
    expect(next.created).toBe(true);
    expect(next.deviceId).not.toBe(original.deviceId);
  });
});
