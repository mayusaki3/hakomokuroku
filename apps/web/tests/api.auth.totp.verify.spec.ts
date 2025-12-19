import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/auth/totp/verify/route';

// --- mocks ---
vi.mock('@/server/auth', () => ({
  getCurrentUser: vi.fn(),
}));
import { getCurrentUser } from '@/server/auth';

vi.mock('@/server/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
import { prisma } from '@/server/prisma';

vi.mock('@/server/totp', () => ({
  verifyTotpPendingCode: vi.fn(),
  generateRecoveryCodes: vi.fn(),
}));
import { verifyTotpPendingCode, generateRecoveryCodes } from '@/server/totp';

describe('AUTH_TOTP_VERIFY (POST /api/auth/totp/verify)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-01: 正常（200）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'U1',
      totpEnabled: false,
      totpPendingSecretEnc: 'enc',
      totpFailCount: 1,
    } as any);
    vi.mocked(verifyTotpPendingCode).mockResolvedValue(true);
    vi.mocked(generateRecoveryCodes).mockReturnValue(['a', 'b']);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recoveryCodes: ['a', 'b'] });
  });

  it('TC-02: 未ログイン（401）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('TC-03: Content-Type 不正（400）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' });

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('TC-04: JSON パース不正（400）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' });

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('TC-05: code 未指定（400）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' });

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('TC-06: code 形式不正（400）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' });

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'abc' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('TC-07: user 不存在（404）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('TC-08: already_enabled（400）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      totpEnabled: true,
    } as any);

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('TC-09: setup 未実行（400）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      totpEnabled: false,
      totpPendingSecretEnc: null,
    } as any);

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('TC-10: code 不正（400 invalid）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      totpEnabled: false,
      totpPendingSecretEnc: 'enc',
      totpFailCount: 0,
    } as any);
    vi.mocked(verifyTotpPendingCode).mockResolvedValue(false);

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('TC-11: DB 例外（500）', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      totpEnabled: false,
      totpPendingSecretEnc: 'enc',
    } as any);
    vi.mocked(verifyTotpPendingCode).mockResolvedValue(true);
    vi.mocked(prisma.user.update).mockRejectedValue(new Error('DB'));

    const req = new Request('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
