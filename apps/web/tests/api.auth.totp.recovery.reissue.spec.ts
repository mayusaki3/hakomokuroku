// apps/web/tests/api.auth.totp.recovery.reissue.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { POST } from '@/app/api/auth/totp/recovery/reissue/route';

// --- mocks: prisma ---
vi.mock('@/server/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
import { prisma } from '@/server/prisma';

// --- mocks: auth ---
vi.mock('@/server/auth', () => ({
  requireUserId: vi.fn(),
}));
import { requireUserId } from '@/server/auth';

// --- mocks: totp verify ---
vi.mock('@/server/totp', () => ({
  verifyTotpCode: vi.fn(),
}));
import { verifyTotpCode } from '@/server/totp';

describe('AUTH_TOTP_RECOVERY_REISSUE (POST /api/auth/totp/recovery/reissue)', () => {
  const url = 'http://localhost/api/auth/totp/recovery/reissue';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-01: 正常：TOTP 有効ユーザーが正しい code で再発行（200）', async () => {
    vi.mocked(requireUserId).mockResolvedValueOnce('U1');

    // totpEnabled=true & totpSecretEncあり
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 'U1',
      totpEnabled: true,
      totpSecretEnc: 'enc-secret',
      recoveryCodes: ['oldhash1', 'oldhash2'],
      totpFailCount: 0,
      lockUntil: null,
    });

    vi.mocked(verifyTotpCode).mockResolvedValueOnce(true);

    (prisma.user.update as any).mockResolvedValueOnce({
      id: 'U1',
    });

    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.recoveryCodes)).toBe(true);
    expect(body.recoveryCodes).toHaveLength(10);

    // 返却は平文（XXXX-XXXX）形式
    for (const c of body.recoveryCodes) {
      expect(typeof c).toBe('string');
      expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }

    // DB更新: recoveryCodes を置換
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const arg = (prisma.user.update as any).mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'U1' });
    expect(Array.isArray(arg.data.recoveryCodes)).toBe(true);
    expect(arg.data.recoveryCodes).toHaveLength(10);
    // ハッシュはhex(sha256)想定の長さ(64)
    for (const h of arg.data.recoveryCodes) {
      expect(typeof h).toBe('string');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-02: 異常：未ログイン（401）', async () => {
    vi.mocked(requireUserId).mockRejectedValueOnce(new Error('UNAUTHORIZED'));

    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-03: 異常：Content-Type 不正（400）', async () => {
    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_request' });
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-04: 異常：JSON パース不正（400）', async () => {
    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_request' });
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-05: 異常：code 未指定/空（400）', async () => {
    vi.mocked(requireUserId).mockResolvedValue('U1');

    const cases: any[] = [{}, { code: '' }, { code: '   ' }];
    for (const c of cases) {
      const req = new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(c),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: 'invalid_request' });
    }
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-06: 異常：code 形式不正（400）', async () => {
    vi.mocked(requireUserId).mockResolvedValue('U1');

    const cases: any[] = [
      { code: 'abc123' },
      { code: '12345' },
      { code: '1234567' },
      { code: '12 3456' },
    ];

    for (const c of cases) {
      const req = new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(c),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: 'invalid_request' });
    }
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-07: 異常：ユーザー不明（404）', async () => {
    vi.mocked(requireUserId).mockResolvedValueOnce('U1');
    (prisma.user.findUnique as any).mockResolvedValueOnce(null);

    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-08: 異常：TOTP 未有効（409）', async () => {
    vi.mocked(requireUserId).mockResolvedValueOnce('U1');
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 'U1',
      totpEnabled: false,
      totpSecretEnc: null,
      recoveryCodes: null,
      totpFailCount: 0,
      lockUntil: null,
    });

    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'conflict' });
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-09: 異常：TOTP 検証失敗（400 auth_failed）', async () => {
    vi.mocked(requireUserId).mockResolvedValueOnce('U1');
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 'U1',
      totpEnabled: true,
      totpSecretEnc: 'enc-secret',
      recoveryCodes: ['oldhash1'],
      totpFailCount: 0,
      lockUntil: null,
    });

    vi.mocked(verifyTotpCode).mockResolvedValueOnce(false);

    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'auth_failed' });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-10: 異常：DB 例外（500 internal_error）', async () => {
    vi.mocked(requireUserId).mockResolvedValueOnce('U1');
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 'U1',
      totpEnabled: true,
      totpSecretEnc: 'enc-secret',
      recoveryCodes: ['oldhash1'],
      totpFailCount: 0,
      lockUntil: null,
    });

    vi.mocked(verifyTotpCode).mockResolvedValueOnce(true);

    (prisma.user.update as any).mockRejectedValueOnce(new Error('DB error'));

    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'internal_error' });
  });

  it('AUTH_TOTP_RECOVERY_REISSUE-TC-11: 正常：再発行により旧リカバリコードが無効化される（実装上は置換を確認）（200）', async () => {
    vi.mocked(requireUserId).mockResolvedValueOnce('U1');
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 'U1',
      totpEnabled: true,
      totpSecretEnc: 'enc-secret',
      recoveryCodes: ['oldhash1', 'oldhash2'],
      totpFailCount: 0,
      lockUntil: null,
    });

    vi.mocked(verifyTotpCode).mockResolvedValueOnce(true);
    (prisma.user.update as any).mockResolvedValueOnce({ id: 'U1' });

    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const arg = (prisma.user.update as any).mock.calls[0][0];
    const nextList = arg.data.recoveryCodes as string[];

    // 旧セットと異なる（置換される）
    expect(nextList).not.toEqual(['oldhash1', 'oldhash2']);
  });
});
