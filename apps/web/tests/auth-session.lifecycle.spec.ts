import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  challengeFind: vi.fn(),
  challengeClaim: vi.fn(),
  userFind: vi.fn(),
  userUpdate: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFind: vi.fn(),
  sessionRevoke: vi.fn(),
  decrypt: vi.fn(),
  totpCheck: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ get: m.cookiesGet }) }));
vi.mock('@/server/prisma', () => ({
  prisma: {
    loginChallenge: { findUnique: m.challengeFind, updateMany: m.challengeClaim },
    user: { findUnique: m.userFind, update: m.userUpdate },
    authSession: { create: m.sessionCreate, findUnique: m.sessionFind, updateMany: m.sessionRevoke },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      loginChallenge: { updateMany: m.challengeClaim },
      user: { findUnique: m.userFind, update: m.userUpdate },
      authSession: { create: m.sessionCreate },
    }),
  },
}));
vi.mock('@/server/crypto', () => ({ decryptStr: m.decrypt }));
vi.mock('otplib', () => ({ authenticator: { check: m.totpCheck } }));
import { POST as verifyLogin } from '@/app/api/auth/login/totp/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { readSession, sessionTokenHash } from '@/server/auth';

const active = {
  id: 'u1', userId: 'alice', isActive: true, totpEnabled: true,
  totpSecretEnc: 'encrypted', recoveryCodes: [], lockUntil: null,
};
function req(body: Record<string, string>) {
  return new Request('http://localhost/api/auth/login/totp', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}
describe('AuthSession lifecycle contracts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.cookiesGet.mockReturnValue(undefined);
    m.challengeFind.mockResolvedValue({
      id: 'ch1', userId: 'u1', used: false, expiresAt: new Date(Date.now() + 60000),
    });
    m.challengeClaim.mockResolvedValue({ count: 1 });
    m.userFind.mockResolvedValue({ ...active });
    m.userUpdate.mockResolvedValue({ id: 'u1' });
    m.sessionCreate.mockResolvedValue({ id: 's1' });
    m.sessionRevoke.mockResolvedValue({ count: 1 });
    m.decrypt.mockResolvedValue('secret');
    m.totpCheck.mockReturnValue(true);
  });

  it('AUTH-S03: valid TOTP consumes challenge and creates session', async () => {
    const res = await verifyLogin(req({ challengeId: 'ch1', code: '123456' }));
    expect(res.status).toBe(200);
    expect(m.challengeClaim).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'ch1', used: false }),
      data: { used: true },
    }));
    expect(m.sessionCreate).toHaveBeenCalledOnce();
    const token = res.cookies.get('hk_session')?.value;
    expect(token).toBeTruthy();
    expect(m.sessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', tokenHash: sessionTokenHash(token!) }),
    });
  });

  it('AUTH-S04: consumed challenge cannot create another session', async () => {
    m.challengeClaim.mockResolvedValueOnce({ count: 0 });
    const res = await verifyLogin(req({ challengeId: 'ch1', code: '123456' }));
    expect(res.status).toBe(404);
    expect(m.sessionCreate).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('AUTH-S05: recovery code is consumed once', async () => {
    const code = 'recovery-one';
    const hash = sessionTokenHash(code);
    m.userFind.mockResolvedValue({ ...active, recoveryCodes: [hash] });
    m.challengeClaim.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const first = await verifyLogin(req({ challengeId: 'ch1', recoveryCode: code }));
    expect(first.status).toBe(200);
    expect(m.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { recoveryCodes: [] },
    }));
    const second = await verifyLogin(req({ challengeId: 'ch1', recoveryCode: code }));
    expect(second.status).toBe(404);
    expect(m.sessionCreate).toHaveBeenCalledOnce();
  });

  it('AUTH-S06: logout revokes the current session and clears cookie', async () => {
    m.cookiesGet.mockReturnValue({ value: 'old-token' });
    const res = await logout();
    expect(res.status).toBe(200);
    expect(m.sessionRevoke).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: sessionTokenHash('old-token'), revokedAt: null },
    }));
    expect(res.cookies.get('hk_session')?.value).toBe('');
  });

  it('AUTH-S07: expired, revoked and inactive sessions cannot authorize', async () => {
    m.cookiesGet.mockReturnValue({ value: 'old-token' });
    for (const session of [
      { revokedAt: new Date(), expiresAt: new Date(Date.now() + 60000), user: { ...active } },
      { revokedAt: null, expiresAt: new Date(Date.now() - 1000), user: { ...active } },
      { revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: { ...active, isActive: false } },
    ]) {
      m.sessionFind.mockResolvedValueOnce(session);
      expect((await readSession()).user).toBeNull();
    }
  });
});
