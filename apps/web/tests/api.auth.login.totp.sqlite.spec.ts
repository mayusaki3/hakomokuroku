import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Must be invoked only by the isolated-db launcher. Never run against dev.db.
const dbUrl = process.env.DATABASE_URL ?? '';
if (process.env.MFA_ISOLATED_TEST !== '1' ||
    !dbUrl.includes('hakomokuroku-mfa-api-')) {
  throw new Error('Refusing to run MFA integration tests outside isolated SQLite database');
}

vi.mock('@/server/crypto', async importOriginal => {
  const original = await importOriginal<typeof import('@/server/crypto')>();
  return { ...original, decryptStr: async () => 'JBSWY3DPEHPK3PXP' };
});
vi.mock('otplib', () => ({
  authenticator: { check: (code: string) => code === '123456' },
}));
vi.mock('@/server/device-login', () => ({
  DEVICE_COOKIE: 'hk_device',
  deviceCookieOptions: () => ({ path: '/', httpOnly: true }),
  attachLoginDevice: async () => 'isolated-device',
}));

const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
vi.mock('@/server/prisma', () => ({ prisma: db }));
const { POST } = await import('../src/app/api/auth/login/totp/route');
function request(challengeId: string, code: string): Request {
  return new Request('http://localhost/api/auth/login/totp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challengeId, code }),
  });
}
async function user(id: string) {
  return db.user.create({
    data: { id, userId: id, passwordHash: 'isolated-test', isActive: true,
      totpEnabled: true, totpSecretEnc: 'mock-encrypted' },
  });
}
async function challenge(id: string, userId: string) {
  await db.loginChallenge.create({
    data: { id, userId, expiresAt: new Date(Date.now() + 600000) },
  });
}

describe('MFA API with isolated SQLite (no Prisma mock)', () => {
  beforeAll(async () => {
    await user('mfa_api_a');
    await user('mfa_api_b');
    await challenge('a1', 'mfa_api_a');
    await challenge('b1', 'mfa_api_b');
  });
  afterAll(async () => { await db.$disconnect(); });

  it('concurrent 5 failures count once each and lock user A', async () => {
    const responses = await Promise.allSettled(
      Array.from({ length: 5 }, () => POST(request('a1', '000000'))),
    );
    const statuses = responses.map(result =>
      result.status === 'fulfilled' ? result.value.status : 'rejected');
    const attempt = await db.mfaLoginAttempt.findUnique({ where: { userId: 'mfa_api_a' } });
    console.log('API concurrent statuses:', statuses);
    console.log('API concurrent state:', attempt?.failCount, attempt?.lockedUntil?.toISOString());
    expect(statuses.sort()).toEqual([400, 400, 400, 400, 429]);
    expect(attempt?.failCount).toBe(5);
    expect(attempt?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    expect((await POST(request('a1', '123456'))).status).toBe(429);
  });

  it('user B can log in while A is locked', async () => {
    const response = await POST(request('b1', '123456'));
    expect(response.status).toBe(200);
    expect(await db.mfaLoginAttempt.findUnique({ where: { userId: 'mfa_api_b' } })).toBeNull();
  });

  it('successful login clears prior MFA failures without touching enrollment count', async () => {
    await user('mfa_api_c');
    await challenge('c1', 'mfa_api_c');
    await db.user.update({ where: { id: 'mfa_api_c' }, data: { totpFailCount: 2 } });
    await db.mfaLoginAttempt.create({ data: { userId: 'mfa_api_c', failCount: 3 } });
    const response = await POST(request('c1', '123456'));
    expect(response.status).toBe(200);
    const attempt = await db.mfaLoginAttempt.findUniqueOrThrow({ where: { userId: 'mfa_api_c' } });
    expect(attempt.failCount).toBe(0);
    expect(attempt.lockedUntil).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: 'mfa_api_c' } })).totpFailCount).toBe(2);
  });
});
