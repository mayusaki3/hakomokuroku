// apps/web/tests/api.auth.tokens.label.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../src/app/api/auth/tokens/label/route'; // 既存の相対に合わせて適宜（あなたの構成通りに）
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/auth/requireUserId', () => ({
  requireUserId: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncToken: {
      updateMany: vi.fn(),
    },
  },
}));

describe('AUTH_TOKENS_LABEL (POST /api/auth/tokens/label)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AUTH_TOKENS_LABEL-TC-01: 正常：body.token 指定でラベル更新（200）', async () => {
    const auth = await import('@/lib/auth/requireUserId');
    (auth.requireUserId as any).mockResolvedValue('u1');
    (prisma.syncToken.updateMany as any).mockResolvedValue({ count: 1 });

    const req = new Request('http://localhost/api/auth/tokens/label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 't1', label: 'my label' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('AUTH_TOKENS_LABEL-TC-02: 異常：未ログイン（401）', async () => {
    const auth = await import('@/lib/auth/requireUserId');
    const e: any = new Error('UNAUTHORIZED');
    e.status = 401;
    (auth.requireUserId as any).mockRejectedValueOnce(e);

    const req = new Request('http://localhost/api/auth/tokens/label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 't1', label: 'my label' }),
    });

    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(401);
  });

  it('AUTH_TOKENS_LABEL-TC-03: 異常：Content-Type 不正（400）', async () => {
    const req = new Request('http://localhost/api/auth/tokens/label', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'x',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('AUTH_TOKENS_LABEL-TC-04: 異常：JSON パース不正（400）', async () => {
    const req = new Request('http://localhost/api/auth/tokens/label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('AUTH_TOKENS_LABEL-TC-05: 異常：label 未指定/非string（400）', async () => {
    const req = new Request('http://localhost/api/auth/tokens/label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 't1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('AUTH_TOKENS_LABEL-TC-06: 異常：token 未指定/非string（400）', async () => {
    const req = new Request('http://localhost/api/auth/tokens/label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'x' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('AUTH_TOKENS_LABEL-TC-07: 異常：対象トークンなし（404）', async () => {
    const auth = await import('@/lib/auth/requireUserId');
    (auth.requireUserId as any).mockResolvedValue('u1');
    (prisma.syncToken.updateMany as any).mockResolvedValue({ count: 0 });

    const req = new Request('http://localhost/api/auth/tokens/label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 't-not-found', label: 'x' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('AUTH_TOKENS_LABEL-TC-08: 異常：DB 例外（500 相当）', async () => {
    const auth = await import('@/lib/auth/requireUserId');
    (auth.requireUserId as any).mockResolvedValue('u1');
    (prisma.syncToken.updateMany as any).mockRejectedValueOnce(new Error('DB error'));

    const req = new Request('http://localhost/api/auth/tokens/label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 't1', label: 'x' }),
    });

    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
