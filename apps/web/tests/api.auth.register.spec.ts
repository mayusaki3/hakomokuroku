import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as POST_REGISTER } from '@/app/api/auth/register/route';

import { prisma } from '@/lib/prisma';

// Prisma モック
vi.mock('@/lib/prisma', () => {
  const user = {
    findFirst: vi.fn(),
    create: vi.fn(),
  };
  return { prisma: { user } };
});

describe('POST /api/auth/register', () => {
  const url = 'http://localhost/api/auth/register';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AUTH_REGISTER-TC-01: 正常：新規ユーザー登録（200）', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({ id: 'U1' });

    const req = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', password: 'p1' }),
    });

    const res = await POST_REGISTER(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const arg = (prisma.user.create as any).mock.calls[0][0];
    expect(arg.data.userId).toBe('u1');
    expect(typeof arg.data.passwordHash).toBe('string');
    expect(arg.data.passwordHash).not.toBe('p1');
  });

  it('AUTH_REGISTER-TC-02: 異常：Content-Type 不正（400）', async () => {
    const req = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'x',
    });
    const res = await POST_REGISTER(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
  });

  it('AUTH_REGISTER-TC-03: 異常：JSON パース不正（400）', async () => {
    const req = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    const res = await POST_REGISTER(req);
    expect(res.status).toBe(400);
  });

  it('AUTH_REGISTER-TC-04: 異常：userId 未指定/空/非string（400）', async () => {
    const cases: any[] = [{}, { userId: '', password: 'p' }, { userId: 123, password: 'p' }];
    for (const c of cases) {
      const req = new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      });
      const res = await POST_REGISTER(req);
      expect(res.status).toBe(400);
    }
  });

  it('AUTH_REGISTER-TC-05: 異常：password 未指定/空/非string（400）', async () => {
    const cases: any[] = [{ userId: 'u' }, { userId: 'u', password: '' }, { userId: 'u', password: 123 }];
    for (const c of cases) {
      const req = new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      });
      const res = await POST_REGISTER(req);
      expect(res.status).toBe(400);
    }
  });

  it('AUTH_REGISTER-TC-06: 異常：既に登録済み（409）', async () => {
    (prisma.user.findFirst as any).mockResolvedValue({ id: 'U1' });

    const req = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', password: 'p1' }),
    });

    const res = await POST_REGISTER(req);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'already_exists' });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('AUTH_REGISTER-TC-07: 異常：DB 例外（500 相当）', async () => {
    (prisma.user.findFirst as any).mockRejectedValue(new Error('boom'));

    const req = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', password: 'p1' }),
    });

    const res = await POST_REGISTER(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it('API_AUTH_REGISTER-TC-08: 異常：JSON パース不正（400）', async () => {
    const { POST } = await import('@/app/api/auth/register/route');

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // JSONとして壊す
      body: '{',
    });

    const res = await POST_REGISTER(req);
    expect(res.status).toBe(400);
  });

  it('AUTH_REGISTER-TC-09: 異常：Content-Type ヘッダ無し（400）', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      // Content-Type を付けない
      body: JSON.stringify({ userId: 'a', password: 'b' }),
    });

    const res = await POST_REGISTER(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
  });

  it('AUTH_REGISTER-TC-10: 異常：JSON が null（400）', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null', // ← JSON としては正しいが body は null になる
    });

    const res = await POST_REGISTER(req);
    expect(res.status).toBe(400);
    // userId/password 検証で bad_request になる想定
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
  });

});
