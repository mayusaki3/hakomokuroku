// tests/api.auth.tokens.revoke.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/auth/tokens/revoke/route';
import { NextRequest } from 'next/server';

vi.mock('@/server/auth', () => ({
  requireUserId: vi.fn(),
}));

vi.mock('@/server/prisma', () => ({
  prisma: {
    syncToken: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { requireUserId } from '@/server/auth';
import { prisma } from '@/server/prisma';

function req(body: any, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/auth/tokens/revoke', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireUserId).mockResolvedValue('U1');
});

describe('POST /api/auth/tokens/revoke', () => {
  it('AUTH_TOKENS_REVOKE-TC-03: Content-Type invalid -> 400', async () => {
    const r = new NextRequest('http://x', { method: 'POST' });
    const res = await POST(r);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_request' });
  });

  it('AUTH_TOKENS_REVOKE-TC-04: invalid json -> 400', async () => {
    const r = {
      headers: {
        get: vi.fn().mockReturnValue('application/json'),
      },
      json: vi.fn().mockRejectedValue(new Error('invalid json')),
    } as any;

    const res = await POST(r);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_request' });
  });

  it('AUTH_TOKENS_REVOKE-TC-05: id missing -> 400', async () => {
    const res = await POST(req({}));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_request' });
  });

  it('AUTH_TOKENS_REVOKE-TC-05: id not string -> 400', async () => {
    const res = await POST(req({ id: 123 }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_request' });
  });

  it('AUTH_TOKENS_REVOKE-TC-06: token not found -> 404', async () => {
    vi.mocked(prisma.syncToken.findUnique).mockResolvedValue(null);

    const res = await POST(req({ id: 'T1' }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('AUTH_TOKENS_REVOKE-TC-07: other user token -> 404', async () => {
    vi.mocked(prisma.syncToken.findUnique).mockResolvedValue({
      id: 'T1',
      userId: 'OTHER',
    } as any);

    const res = await POST(req({ id: 'T1' }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('AUTH_TOKENS_REVOKE-TC-01: success -> 204', async () => {
    vi.mocked(prisma.syncToken.findUnique).mockResolvedValue({
      id: 'T1',
      userId: 'U1',
    } as any);

    const res = await POST(req({ id: 'T1' }));

    expect(res.status).toBe(204);
    expect(prisma.syncToken.delete).toHaveBeenCalledWith({ where: { id: 'T1' } });
  });

  it('AUTH_TOKENS_REVOKE-TC-08: findUnique db error -> 500', async () => {
    vi.mocked(prisma.syncToken.findUnique).mockRejectedValue(new Error('DB error'));

    const res = await POST(req({ id: 'T1' }));

    expect(res.status).toBe(500);
  });

  it('AUTH_TOKENS_REVOKE-TC-08: delete db error -> 500', async () => {
    vi.mocked(prisma.syncToken.findUnique).mockResolvedValue({
      id: 'T1',
      userId: 'U1',
    } as any);

    vi.mocked(prisma.syncToken.delete).mockRejectedValue(new Error('DB error'));

    const res = await POST(req({ id: 'T1' }));

    expect(res.status).toBe(500);
  });
});
