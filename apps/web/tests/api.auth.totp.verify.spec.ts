// tests/api.auth.totp.verify.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';

vi.mock('@/server/auth', () => ({
  getCurrentUser: vi.fn(),
  issueRecoveryCodes: vi.fn(),
}));

vi.mock('@/server/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('otplib', () => ({
  authenticator: {
    check: vi.fn(),
  },
}));

import { getCurrentUser, issueRecoveryCodes } from '@/server/auth';
import { prisma } from '@/server/prisma';
import { authenticator } from 'otplib';

async function importRouteFresh() {
  vi.resetModules();
  const mod = await import('@/app/api/auth/totp/verify/route');
  return mod.POST as (req: Request) => Promise<Response>;
}

function makeReq(body: any, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/auth/totp/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/**
 * route の復号仕様（iv(12)+tag(16)+cipher）に合わせて暗号化して、テストで復号を通す。
 */
function encryptPendingSecret(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  const iv = Buffer.alloc(12, 7); // 固定でもOK（テスト用途）
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

beforeEach(() => {
  vi.resetAllMocks();

  // 32 bytes base64（固定）
  process.env.TOTP_SECRET_KEY = Buffer.alloc(32, 2).toString('base64');

  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'U1' } as any);
  vi.mocked(prisma.user.update).mockResolvedValue({} as any);

  vi.mocked(issueRecoveryCodes).mockReturnValue({
    recoveryCodesPlain: Array.from({ length: 10 }, (_, i) => `RC-${i}`),
    recoveryCodesHashed: Array.from({ length: 10 }, (_, i) => `H-${i}`),
  } as any);

  // デフォルトは成功
  vi.mocked(authenticator.check).mockReturnValue(true);

  const pending = encryptPendingSecret('SECRET', process.env.TOTP_SECRET_KEY!);

  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'U1',
    totpEnabled: false,
    totpPendingSecretEnc: pending,
  } as any);
});

describe('POST /api/auth/totp/verify', () => {
  it('T01: Content-Type 不正 -> 400 invalid_request', async () => {
    const POST = await importRouteFresh();
    const res = await POST(makeReq({ code: '123456' }, { 'content-type': 'text/plain' }) as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_request' });
  });

  it('T02: JSON 不正 -> 400 invalid_request', async () => {
    const POST = await importRouteFresh();
    const r = new NextRequest('http://localhost/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const res = await POST(r as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_request' });
  });

  it('T03: code 形式不正 -> 400 invalid_request', async () => {
    const POST = await importRouteFresh();
    const res = await POST(makeReq({ code: '12345' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_request' });
  });

  it('T04: 未ログイン -> 401', async () => {
    const POST = await importRouteFresh();
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null as any);

    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('T05: ユーザー不明 -> 404', async () => {
    const POST = await importRouteFresh();
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as any);

    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('T06: 既に有効 -> 409 conflict', async () => {
    const POST = await importRouteFresh();
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'U1',
      totpEnabled: true,
      totpPendingSecretEnc: 'x',
    } as any);

    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'conflict' });
  });

  it('T07: setup 未実行 -> 409 conflict', async () => {
    const POST = await importRouteFresh();
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'U1',
      totpEnabled: false,
      totpPendingSecretEnc: null,
    } as any);

    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'conflict' });
  });

  it('T08: code 不一致 -> 400 auth_failed + failCount++', async () => {
    const POST = await importRouteFresh();
    vi.mocked(authenticator.check).mockReturnValueOnce(false);

    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'auth_failed' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'U1' },
        data: { totpFailCount: { increment: 1 } },
      }),
    );
  });

  it('T09: 正常 -> 200 + recoveryCodes(10)', async () => {
    const POST = await importRouteFresh();

    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.recoveryCodes)).toBe(true);
    expect(json.recoveryCodes).toHaveLength(10);
  });

  it('T10: 内部エラー -> 500 internal_error', async () => {
    const POST = await importRouteFresh();
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('db'));

    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'internal_error' });
  });
});
