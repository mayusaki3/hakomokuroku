import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), password: vi.fn(), createSession: vi.fn(), revokeSession: vi.fn(),
  attach: vi.fn(), challengeCreate: vi.fn(), challengeFind: vi.fn(),
  userUpdate: vi.fn(), transaction: vi.fn(), claim: vi.fn(), sessionCreate: vi.fn(),
  decrypt: vi.fn(), check: vi.fn(), mfaFind: vi.fn(), mfaUpsert: vi.fn(), mfaUpdate: vi.fn(), mfaFindOrThrow: vi.fn(),
}));
vi.mock('@/server/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.user, update: mocks.userUpdate },
    loginChallenge: { create: mocks.challengeCreate, findUnique: mocks.challengeFind },
    mfaLoginAttempt: { findUnique: mocks.mfaFind },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/server/password', () => ({ verifyPassword: mocks.password }));
vi.mock('@/server/auth', () => ({
  SESSION_COOKIE: 'hk_session',
  sessionCookieOptions: () => ({ httpOnly: true, path: '/', sameSite: 'lax' }),
  createSession: mocks.createSession,
  revokeSession: mocks.revokeSession,
  sessionTokenHash: (s: string) => 'hash:' + s,
}));
vi.mock('@/server/device-login', () => ({
  DEVICE_COOKIE: 'hk_device',
  deviceCookieOptions: () => ({ httpOnly: true, path: '/', sameSite: 'lax' }),
  attachLoginDevice: mocks.attach,
}));
vi.mock('@/server/crypto', () => ({ decryptStr: mocks.decrypt }));
vi.mock('otplib', () => ({ authenticator: { check: mocks.check } }));

import { POST as passwordLogin } from '@/app/api/auth/login/route';
import { POST as totpLogin } from '@/app/api/auth/login/totp/route';

const request = (path: string, body: unknown, cookie?: string) => new Request('http://localhost' + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});
const user = { id: 'user-db', userId: 'alice', passwordHash: 'hash', isActive: true, lockUntil: null, totpEnabled: false };
const challenge = { id: 'challenge', userId: user.id, used: false, expiresAt: new Date(Date.now() + 60000) };

describe('Login API device registration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.mfaFind.mockResolvedValue(null);
    mocks.mfaFindOrThrow.mockResolvedValue({ failCount: 0, lockedUntil: null });
    mocks.mfaUpdate.mockResolvedValue({ failCount: 1, lockedUntil: null });
    mocks.user.mockResolvedValue({ ...user });
    mocks.password.mockResolvedValue(true);
    mocks.createSession.mockResolvedValue({ token: 'session-token', sessionId: 'session-db' });
    mocks.revokeSession.mockResolvedValue(undefined);
    mocks.attach.mockResolvedValue('device-id.device-secret');
    mocks.userUpdate.mockResolvedValue({});
    mocks.challengeCreate.mockResolvedValue(challenge);
    mocks.challengeFind.mockResolvedValue(challenge);
    mocks.decrypt.mockResolvedValue('totp-secret');
    mocks.check.mockReturnValue(true);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.sessionCreate.mockResolvedValue({ id: 'totp-session-db' });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      loginChallenge: { updateMany: mocks.claim },
      authSession: { create: mocks.sessionCreate },
      mfaLoginAttempt: { upsert: mocks.mfaUpsert, findUniqueOrThrow: mocks.mfaFindOrThrow, update: mocks.mfaUpdate },
      user: { update: mocks.userUpdate, findUnique: mocks.user },
    }));
  });

  it('registers and sets both cookies after password login', async () => {
    const req = request('/api/auth/login', { userId: 'alice', password: 'correct' });
    const res = await passwordLogin(req);
    expect(res.status).toBe(200);
    expect(mocks.attach).toHaveBeenCalledWith(user.id, 'session-db', req);
    const cookies = res.headers.get('set-cookie') ?? '';
    expect(cookies).toContain('hk_session=');
    expect(cookies).toContain('hk_device=');
    expect(cookies.toLowerCase()).toContain('httponly');
  });

  it('does not register on invalid password', async () => {
    mocks.password.mockResolvedValue(false);
    const res = await passwordLogin(request('/api/auth/login', { userId: 'alice', password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it('does not register at the MFA challenge stage', async () => {
    mocks.user.mockResolvedValue({ ...user, totpEnabled: true });
    const res = await passwordLogin(request('/api/auth/login', { userId: 'alice', password: 'correct' }));
    expect(res.status).toBe(200);
    expect((await res.json()).mfaRequired).toBe(true);
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('passes the incoming device cookie to the registration helper on password login', async () => {
    const req = request('/api/auth/login', { userId: 'alice', password: 'correct' }, 'hk_device=previous');
    expect((await passwordLogin(req)).status).toBe(200);
    expect(mocks.attach).toHaveBeenCalledWith(user.id, 'session-db', req);
  });

  it('revokes the newly created session if device association fails', async () => {
    mocks.attach.mockRejectedValue(new Error('device failed'));
    const res = await passwordLogin(request('/api/auth/login', { userId: 'alice', password: 'correct' }));
    expect(res.status).toBe(500);
    expect(mocks.revokeSession).toHaveBeenCalledWith('session-token');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('registers only after successful TOTP and sets both cookies', async () => {
    mocks.user.mockResolvedValue({ ...user, totpEnabled: true, totpSecretEnc: 'encrypted', recoveryCodes: [] });
    const req = request('/api/auth/login/totp', { challengeId: 'challenge', code: '123456' });
    const res = await totpLogin(req);
    expect(res.status).toBe(200);
    expect(mocks.attach).toHaveBeenCalledWith(user.id, 'totp-session-db', req);
    const cookies = res.headers.get('set-cookie') ?? '';
    expect(cookies).toContain('hk_session=');
    expect(cookies).toContain('hk_device=');
  });

  it('does not register when TOTP verification fails', async () => {
    mocks.user.mockResolvedValue({ ...user, totpEnabled: true, totpSecretEnc: 'encrypted' });
    mocks.check.mockReturnValue(false);
    const res = await totpLogin(request('/api/auth/login/totp', { challengeId: 'challenge', code: '000000' }));
    expect(res.status).toBe(400);
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('revokes the TOTP session when device association fails', async () => {
    mocks.user.mockResolvedValue({ ...user, totpEnabled: true, totpSecretEnc: 'encrypted' });
    mocks.attach.mockRejectedValue(new Error('device failed'));
    const res = await totpLogin(request('/api/auth/login/totp', { challengeId: 'challenge', code: '123456' }));
    expect(res.status).toBe(500);
    expect(mocks.revokeSession).toHaveBeenCalledWith(expect.any(String));
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
