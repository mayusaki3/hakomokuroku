import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, createCipheriv } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { authenticator } from 'otplib';
import { hashPassword } from '@/server/password';
import { sessionTokenHash } from '@/server/auth';

if (process.env.DATABASE_URL !== 'file:./api-device-login-integration.db') {
  throw new Error('Run with scripts/test-api-device-login-sqlite.ps1');
}
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
vi.mock('@/server/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } }) };
});
import { POST as login } from '@/app/api/auth/login/route';
import { POST as totpLogin } from '@/app/api/auth/login/totp/route';

const userId = 'api-device-' + randomBytes(6).toString('hex');
const dbId = 'db-' + userId;
const password = 'Test-Password-123!';
const secret = authenticator.generateSecret();
const key = randomBytes(32);
const encrypt = (plaintext: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
};
const request = (path: string, body: unknown, cookie?: string) => new Request('http://localhost' + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});
const cookies = (res: Response) => {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [headers.get('set-cookie') ?? ''];
  const combined = values.join(', ');
  const session = /hk_session=([^;,\s]+)/.exec(combined)?.[1];
  const device = /hk_device=([^;,\s]+)/.exec(combined)?.[1];
  return { session, device, combined };
};
const storedSession = async (token: string) => prisma.authSession.findUniqueOrThrow({
  where: { tokenHash: sessionTokenHash(token) },
});

describe('Real SQLite login API and device registration', () => {
  beforeAll(async () => {
    process.env.TOTP_SECRET_KEY = key.toString('base64');
    await prisma.user.create({ data: { id: dbId, userId, passwordHash: await hashPassword(password) } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: dbId } });
    await prisma.loginChallenge.deleteMany({ where: { userId: dbId } });
    await prisma.$disconnect();
    delete process.env.TOTP_SECRET_KEY;
  });

  it('password login registers a device, binds session, and reuses verified device', async () => {
    const first = await login(request('/api/auth/login', { userId, password }));
    expect(first.status).toBe(200);
    const a = cookies(first);
    expect(a.session).toBeTruthy();
    expect(a.device).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(a.combined.toLowerCase()).toContain('httponly');
    const firstSession = await storedSession(a.session!);
    expect(firstSession.deviceId).toBe(a.device!.split('.')[0]);
    const device = await prisma.device.findUniqueOrThrow({
      where: { userId_deviceId: { userId: dbId, deviceId: firstSession.deviceId! } },
    });
    expect(device.credentialHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await prisma.devicePrefix.count({ where: { userId: dbId, deviceId: device.deviceId } })).toBe(1);

    const second = await login(request('/api/auth/login', { userId, password }, 'hk_device=' + a.device + '; hk_session=' + a.session));
    expect(second.status).toBe(200);
    const b = cookies(second);
    expect(b.device).toBe(a.device);
    expect((await storedSession(b.session!)).deviceId).toBe(device.deviceId);
    expect((await storedSession(a.session!)).revokedAt).not.toBeNull();
    expect(await prisma.device.count({ where: { userId: dbId } })).toBe(1);
  });

  it('rejects bad password without creating device or session', async () => {
    const before = await prisma.authSession.count({ where: { userId: dbId } });
    const res = await login(request('/api/auth/login', { userId, password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(cookies(res).device).toBeUndefined();
    expect(await prisma.authSession.count({ where: { userId: dbId } })).toBe(before);
  });

  it('TOTP challenge does not register; successful TOTP does, and resumes device', async () => {
    await prisma.user.update({ where: { id: dbId }, data: { totpEnabled: true, totpSecretEnc: encrypt(secret) } });
    const before = await prisma.device.count({ where: { userId: dbId } });
    const initial = await login(request('/api/auth/login', { userId, password }));
    expect(initial.status).toBe(200);
    const payload = await initial.json() as { mfaRequired: boolean; challengeId: string };
    expect(payload.mfaRequired).toBe(true);
    expect(cookies(initial).device).toBeUndefined();
    expect(await prisma.device.count({ where: { userId: dbId } })).toBe(before);

    const invalid = await totpLogin(request('/api/auth/login/totp', { challengeId: payload.challengeId, code: 'not-a-code' }));
    expect(invalid.status).toBe(400);
    expect(await prisma.device.count({ where: { userId: dbId } })).toBe(before);

    const completed = await totpLogin(request('/api/auth/login/totp', { challengeId: payload.challengeId, code: authenticator.generate(secret) }));
    expect(completed.status).toBe(200);
    const result = cookies(completed);
    expect(result.device).toBeTruthy();
    expect((await storedSession(result.session!)).deviceId).toBe(result.device!.split('.')[0]);
    expect(await prisma.device.count({ where: { userId: dbId } })).toBe(before + 1);

    const challenge2 = await login(request('/api/auth/login', { userId, password }));
    const challenge2Id = (await challenge2.json() as { challengeId: string }).challengeId;
    const again = await totpLogin(request('/api/auth/login/totp', { challengeId: challenge2Id, code: authenticator.generate(secret) }, 'hk_device=' + result.device));
    expect(again.status).toBe(200);
    expect(cookies(again).device).toBe(result.device);
    expect(await prisma.device.count({ where: { userId: dbId } })).toBe(before + 1);
  });
});
