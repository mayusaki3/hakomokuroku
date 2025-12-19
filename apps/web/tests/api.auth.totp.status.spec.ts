// apps/web/tests/api.auth.totp.status.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/auth/totp/status/route';

// prisma mock（route.ts の import に合わせる）
vi.mock('@/server/prisma', () => ({
  prisma: {
    loginChallenge: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));
import { prisma } from '@/server/prisma';

describe('GET /api/auth/totp/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AUTH_TOTP_STATUS-TC-01: 正常：challenge 有効 + recoveryCodes 配列なら remain を返す（200）', async () => {
    (prisma.loginChallenge.findUnique as any).mockResolvedValue({
      id: 'C1',
      userId: 'U1',
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      recoveryCodes: ['h1', 'h2', 'h3'],
    });

    const req = new Request('http://localhost/api/auth/totp/status?challengeId=C1');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recoveryRemain: 3 });
  });

  it('AUTH_TOTP_STATUS-TC-02: 異常：challengeId 無しは 400', async () => {
    const req = new Request('http://localhost/api/auth/totp/status');
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
  });

  it('AUTH_TOTP_STATUS-TC-03: 異常：challenge 不存在は 404', async () => {
    (prisma.loginChallenge.findUnique as any).mockResolvedValue(null);

    const req = new Request('http://localhost/api/auth/totp/status?challengeId=C404');
    const res = await GET(req);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('AUTH_TOTP_STATUS-TC-04: 異常：challenge.used=true は 404', async () => {
    (prisma.loginChallenge.findUnique as any).mockResolvedValue({
      id: 'C1',
      userId: 'U1',
      used: true,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const req = new Request('http://localhost/api/auth/totp/status?challengeId=C1');
    const res = await GET(req);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('AUTH_TOTP_STATUS-TC-05: 異常：challenge 期限切れは 404', async () => {
    (prisma.loginChallenge.findUnique as any).mockResolvedValue({
      id: 'C1',
      userId: 'U1',
      used: false,
      expiresAt: new Date(Date.now() - 1),
    });

    const req = new Request('http://localhost/api/auth/totp/status?challengeId=C1');
    const res = await GET(req);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('AUTH_TOTP_STATUS-TC-06: 正常：recoveryCodes が null/非配列なら 0（200）', async () => {
    (prisma.loginChallenge.findUnique as any).mockResolvedValue({
      id: 'C1',
      userId: 'U1',
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.user.findUnique as any).mockResolvedValue({
      recoveryCodes: null,
    });

    const req = new Request('http://localhost/api/auth/totp/status?challengeId=C1');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recoveryRemain: 0 });
  });

  it('AUTH_TOTP_STATUS-TC-07: 異常：DB例外は 500', async () => {
    (prisma.loginChallenge.findUnique as any).mockRejectedValue(new Error('DB error'));

    const req = new Request('http://localhost/api/auth/totp/status?challengeId=C1');
    const res = await GET(req);

    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
