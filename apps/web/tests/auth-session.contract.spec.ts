import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  createChallenge: vi.fn(),
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  verifyPassword: vi.fn(),
  readSession: vi.fn(),
}));
vi.mock('@/server/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUser, update: mocks.updateUser },
    loginChallenge: { create: mocks.createChallenge },
  },
}));
vi.mock('@/server/password', () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock('@/server/auth', () => ({
  SESSION_COOKIE: 'hk_session',
  createSession: mocks.createSession,
  revokeSession: mocks.revokeSession,
  readSession: mocks.readSession,
  sessionCookieOptions: () => ({
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 30 * 24 * 60 * 60,
  }),
}));
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/auth/me/route';

function request(userId = 'alice', password = 'secret') {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, password }),
  });
}
const activeUser = {
  id: 'u1', userId: 'alice', isActive: true, lockUntil: null,
  passwordHash: 'hashed', totpEnabled: false,
};

describe('v0.8 session authentication contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findUser.mockResolvedValue({ ...activeUser });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.createSession.mockResolvedValue({ token: 'new-token', expiresAt: new Date(Date.now() + 60000) });
    mocks.createChallenge.mockResolvedValue({ id: 'challenge-1' });
    mocks.updateUser.mockResolvedValue({ id: 'u1' });
    mocks.readSession.mockResolvedValue({ user: null });
  });

  it('AUTH-S01: password login without TOTP creates one valid session', async () => {
    const res = await login(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mfaRequired: false });
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(mocks.createSession).toHaveBeenCalledWith('u1');
    expect(mocks.createChallenge).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toContain('hk_session=new-token');
  });

  it('AUTH-S02: password login with TOTP creates challenge but no session', async () => {
    mocks.findUser.mockResolvedValue({ ...activeUser, totpEnabled: true });
    const res = await login(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mfaRequired: true, challengeId: 'challenge-1' });
    expect(mocks.createChallenge).toHaveBeenCalledOnce();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });


  it('AUTH-S08: session cookie is HttpOnly, SameSite=Lax, Path=/, Secure in production', async () => {
    const res = await login(request());
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/httponly/i);
    expect(cookie).toMatch(/samesite=lax/i);
    expect(cookie).toMatch(/path=\//i);
    if (process.env.NODE_ENV === 'production') expect(cookie).toMatch(/secure/i);
  });

  it('AUTH-S09: GET /api/auth/me is not cacheable', async () => {
    const res = await me();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it.todo('AUTH-S10: account and image APIs enforce session User scope');
  it.todo('AUTH-S11: registration does not issue a session');

  it('AUTH-S12: login failures do not disclose whether user exists', async () => {
    mocks.findUser.mockResolvedValueOnce(null);
    const unknown = await login(request('unknown'));
    mocks.verifyPassword.mockResolvedValueOnce(false);
    const incorrect = await login(request());
    expect(unknown.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(await unknown.json()).toEqual(await incorrect.json());
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
