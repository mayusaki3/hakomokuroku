// tests/api.auth.totp.setup.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/server/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/server/auth', () => ({
  getCurrentUser: vi.fn(),
}));

import { prisma } from '@/server/prisma';
import { getCurrentUser } from '@/server/auth';

// route は動的 import（env/モック反映とモジュールキャッシュ回避）
async function importPost() {
  const mod = await import('@/app/api/auth/totp/setup/route');
  return mod.POST as () => Promise<Response>;
}

function setValidKey() {
  // 32 bytes の鍵を base64 化
  process.env.TOTP_SECRET_KEY = Buffer.alloc(32, 1).toString('base64');
}

async function importRoute() {
  // env を切り替えるテストがあるので毎回モジュールキャッシュを切る
  vi.resetModules();
  const mod = await import('@/app/api/auth/totp/setup/route');
  return mod.POST as (req: Request) => Promise<Response>;
}

const baseUser = {
  id: 'U1',
  totpEnabled: false,
  totpPendingSecretEnc: null,
};

const KEY_OK_B64 = Buffer.alloc(32, 1).toString('base64');

beforeEach(async () => {
  setValidKey();
  vi.resetAllMocks();
  await vi.resetModules();

  process.env.TOTP_SECRET_KEY = KEY_OK_B64;

  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as any);
  vi.mocked(prisma.user.update).mockResolvedValue({} as any);
});

afterEach(() => {
  delete process.env.TOTP_SECRET_KEY;
});

describe('POST /api/auth/totp/setup', () => {
  it('T01: 未ログイン -> 401 unauthorized', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null as any);

    const POST = await importPost();
    const res = await POST();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('T02: ユーザー不明 -> 404 not_found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as any);

    const POST = await importPost();
    const res = await POST();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('T03: 既に TOTP 有効 -> 409 conflict', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...baseUser,
      totpEnabled: true,
    } as any);

    const POST = await importPost();
    const res = await POST();

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'conflict' });
  });

  it('T04: 正常 -> 200 + otpauthUrl', async () => {
    const POST = await importPost();
    const res = await POST();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.otpauthUrl).toBe('string');
    expect(json.otpauthUrl).toContain('otpauth://');
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('T05: DB 例外 -> 500 internal_error', async () => {
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('DB'));

    const POST = await importPost();
    const res = await POST();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'internal_error' });
  });

  it('T06: 内部エラー -> 500 internal_error（鍵未設定）', async () => {
    delete process.env.TOTP_SECRET_KEY;

    const POST = await importRoute();
    const res = await POST(/* makeReq() or existing helper */);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'internal_error' });
  });

  it('T07: 内部エラー -> 500 internal_error（鍵長不正）', async () => {
    // 31 bytes にして buf.length !== 32 を踏む
    process.env.TOTP_SECRET_KEY = Buffer.alloc(31, 2).toString('base64');

    const POST = await importRoute();
    const res = await POST(/* makeReq() or existing helper */);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'internal_error' });
  });

});
