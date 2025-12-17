import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import * as auth from '@/server/auth';

// Prisma モック
vi.mock('@/lib/prisma', () => {
  const syncToken = { findMany: vi.fn() };
  return { prisma: { syncToken } };
});

// auth モック（cookies を踏まない）
vi.mock('@/server/auth', () => {
  return { requireUserId: vi.fn() };
});

describe('AUTH_TOKENS (GET /api/auth/tokens)', () => {
  const url = 'http://localhost/api/auth/tokens';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AUTH_TOKENS-TC-01: 正常：トークン一覧を返す（200）', async () => {
    (auth.requireUserId as any).mockResolvedValue('U1');
    (prisma.syncToken.findMany as any).mockResolvedValue([
      { id: 't1', label: 'L1', createdAt: new Date(), lastUsedAt: null, expiresAt: new Date() },
      { id: 't2', label: 'L2', createdAt: new Date(), lastUsedAt: new Date(), expiresAt: new Date() },
    ]);

    const { GET } = await import('@/app/api/auth/tokens/route');

    const req = new Request(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });

  it('AUTH_TOKENS-TC-02: 正常：0件でも空配列（200）', async () => {
    (auth.requireUserId as any).mockResolvedValue('U1');
    (prisma.syncToken.findMany as any).mockResolvedValue([]);

    const { GET } = await import('@/app/api/auth/tokens/route');

    const req = new Request(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('AUTH_TOKENS-TC-03: 異常：未ログイン（401）', async () => {
    const e: any = new Error('Unauthorized');
    e.status = 401;
    (auth.requireUserId as any).mockRejectedValue(e);

    const { GET } = await import('@/app/api/auth/tokens/route');

    const req = new Request(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await GET(req);

    expect([401, 500]).toContain(res.status);
  });

  it('AUTH_TOKENS-TC-04: 異常：Content-Type 不正（400）', async () => {
    const { GET } = await import('@/app/api/auth/tokens/route');

    const req = new Request(url, { method: 'GET' }); // Content-Typeなし
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
  });

  it('AUTH_TOKENS-TC-05: 異常：DB 例外（500 相当）', async () => {
    (auth.requireUserId as any).mockResolvedValue('U1');
    (prisma.syncToken.findMany as any).mockRejectedValue(new Error('boom'));

    const { GET } = await import('@/app/api/auth/tokens/route');

    const req = new Request(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await GET(req);

    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
