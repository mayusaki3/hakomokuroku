// tests/api.auth.totp.setup.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/server/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// otplib は固定値にして環境差を消す
vi.mock('otplib', () => ({
  authenticator: {
    generateSecret: vi.fn(),
    keyuri: vi.fn(),
  },
}));

import { getCurrentUser } from '@/server/auth';
import { prisma } from '@/server/prisma';
import { authenticator } from 'otplib';

/**
 * route は process.env をトップレベルで読む可能性があるため、
 * import し直してモジュールキャッシュを跨がない。
 */
async function importRouteFresh() {
  vi.resetModules();
  const mod = await import('@/app/api/auth/totp/setup/route');
  return mod.POST as () => Promise<Response>;
}

function makeReq() {
  return new NextRequest('http://localhost/api/auth/totp/setup', { method: 'POST' });
}

beforeEach(() => {
  vi.resetAllMocks();

  // 32 bytes base64（固定）
  process.env.TOTP_SECRET_KEY = Buffer.alloc(32, 1).toString('base64');

  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'U1',
    userId: 'user1',
    totpEnabled: false,
  } as any);
  vi.mocked(prisma.user.update).mockResolvedValue({} as any);

  vi.mocked(authenticator.generateSecret).mockReturnValue('SECRET');
  vi.mocked(authenticator.keyuri).mockReturnValue('otpauth://totp/xxx');
});

describe('POST /api/auth/totp/setup', () => {
  it('T01: 未ログイン -> 401', async () => {
    const POST = await importRouteFresh();
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null as any);

    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('T02: ユーザー不明 -> 404', async () => {
    const POST = await importRouteFresh();
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as any);

    const res = await POST();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('T03: 既に TOTP 有効 -> 409 conflict', async () => {
    const POST = await importRouteFresh();
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'U1',
      totpEnabled: true,
    } as any);

    const res = await POST();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'conflict' });
  });

  it('T04: 正常 -> 200 + otpauthUrl', async () => {
    const POST = await importRouteFresh();

    const res = await POST();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.otpauthUrl).toBe('otpauth://totp/xxx');

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('T05: 内部エラー -> 500 internal_error（例：DB例外）', async () => {
    const POST = await importRouteFresh();
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('db'));

    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'internal_error' });
  });

  it('T06: 内部エラー -> 500 internal_error（例：鍵未設定）', async () => {
    // env を「import 前」に落とす（トップレベル読み取り対策）
    process.env.TOTP_SECRET_KEY = '';

    const POST = await importRouteFresh();

    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'internal_error' });
  });
});
