// apps/web/tests/api.auth.totp.setup.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

// otplib をモック（generateSecret / keyuri を安定化）
vi.mock('otplib', () => ({
  authenticator: {
    generateSecret: vi.fn(),
    keyuri: vi.fn(),
  },
}));
import { authenticator } from 'otplib';

// crypto をモック（randomBytes を安定化）
vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn(),
    createCipheriv: vi.fn(),
  },
}));
import crypto from 'crypto';

// route はテスト中に env を変えるため、動的 import で読む
async function loadRoute() {
  const mod = await import('@/app/api/auth/totp/setup/route');
  return { GET: mod.GET, POST: mod.POST };
}

describe('POST /api/auth/totp/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TOTP_SECRET_KEY = Buffer.alloc(32).toString('base64'); // 正常な 32 bytes
  });

  it('AUTH_TOTP_SETUP-TC-01: GET は 405', async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(405);
  });

  it('AUTH_TOTP_SETUP-TC-02: 未ログインは 401', async () => {
    const { POST } = await loadRoute();
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null as any);

    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('AUTH_TOTP_SETUP-TC-03: user 不在は 404', async () => {
    const { POST } = await loadRoute();
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'U1' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as any);

    const res = await POST();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('AUTH_TOTP_SETUP-TC-04: 既に有効なら 400', async () => {
    const { POST } = await loadRoute();
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'U1' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'U1',
      userId: 'login',
      totpEnabled: true,
    } as any);

    const res = await POST();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'already_enabled' });
  });

  it('AUTH_TOTP_SETUP-TC-05: 正常：pending を保存して otpauthUrl を返す（200）', async () => {
    const { POST } = await loadRoute();

    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'U1' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'U1',
      userId: 'alice',
      totpEnabled: false,
    } as any);

    // 暗号化の結果を安定させる：randomBytes / cipher を偽装
    vi.mocked(authenticator.generateSecret).mockReturnValueOnce('SECRET');
    vi.mocked(authenticator.keyuri).mockReturnValueOnce('otpauth://dummy');

    // encryptWithEnvKey が内部で randomBytes/createCipheriv を使うので、その戻り値を固定
    (crypto.randomBytes as any).mockReturnValueOnce(Buffer.alloc(12, 1)); // iv
    const cipherMock = {
      update: vi.fn().mockReturnValue(Buffer.from('ENC1')),
      final: vi.fn().mockReturnValue(Buffer.from('ENC2')),
      getAuthTag: vi.fn().mockReturnValue(Buffer.alloc(16, 2)),
    };
    (crypto.createCipheriv as any).mockReturnValueOnce(cipherMock);

    vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: 'U1' } as any);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, otpauthUrl: 'otpauth://dummy' });

    // update の内容確認
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const arg = (prisma.user.update as any).mock.calls[0][0];

    expect(arg.where).toEqual({ id: 'U1' });
    expect(arg.data.totpFailCount).toBe(0);
    expect(arg.data.totpPendingAt).toBeInstanceOf(Date);
    expect(typeof arg.data.totpPendingSecretEnc).toBe('string');
    expect(arg.data.totpPendingSecretEnc.length).toBeGreaterThan(0);

    // otpauth の label/issuer
    expect(authenticator.keyuri).toHaveBeenCalledTimes(1);
    const keyuriArgs = (authenticator.keyuri as any).mock.calls[0];
    // keyuri(label, issuer, secret) の想定
    expect(keyuriArgs[0]).toBe('Hakomokuroku: alice');
    expect(keyuriArgs[1]).toBe('Hakomokuroku');
    expect(keyuriArgs[2]).toBe('SECRET');
  });

  it('AUTH_TOTP_SETUP-TC-06: user.userId が null の場合 label は user を使う', async () => {
    const { POST } = await loadRoute();

    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'U1' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'U1',
      userId: null,
      totpEnabled: false,
    } as any);

    vi.mocked(authenticator.generateSecret).mockReturnValueOnce('SECRET');
    vi.mocked(authenticator.keyuri).mockReturnValueOnce('otpauth://dummy');

    (crypto.randomBytes as any).mockReturnValueOnce(Buffer.alloc(12, 1));
    const cipherMock = {
      update: vi.fn().mockReturnValue(Buffer.from('ENC1')),
      final: vi.fn().mockReturnValue(Buffer.from('ENC2')),
      getAuthTag: vi.fn().mockReturnValue(Buffer.alloc(16, 2)),
    };
    (crypto.createCipheriv as any).mockReturnValueOnce(cipherMock);

    vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: 'U1' } as any);

    const res = await POST();
    expect(res.status).toBe(200);

    const keyuriArgs = (authenticator.keyuri as any).mock.calls[0];
    expect(keyuriArgs[0]).toBe('Hakomokuroku: user');
  });

  it('AUTH_TOTP_SETUP-TC-07: DB 例外は 500', async () => {
    const { POST } = await loadRoute();
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'U1' } as any);
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB error'));

    const res = await POST();
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it('AUTH_TOTP_SETUP-TC-08: TOTP_SECRET_KEY が未設定/不正なら 500', async () => {
    // モジュール内の ENC_KEY_B64 は import 時に読むので、resetModules → env変更 → 再import
    vi.resetModules();
    process.env.TOTP_SECRET_KEY = ''; // 未設定

    const mod = await import('@/app/api/auth/totp/setup/route');
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'U1' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'U1',
      userId: 'alice',
      totpEnabled: false,
    } as any);

    const res = await mod.POST();
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
