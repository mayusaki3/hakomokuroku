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
  it('T01: Content-Type invalid -> 400', async () => {
    const r = new NextRequest('http://x', { method: 'POST' });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it('T02: id missing -> 400', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('T03: token not found -> 404', async () => {
    vi.mocked(prisma.syncToken.findUnique).mockResolvedValue(null);

    const res = await POST(req({ id: 'T1' }));
    expect(res.status).toBe(404);
  });

  it('T04: other user token -> 404', async () => {
    vi.mocked(prisma.syncToken.findUnique).mockResolvedValue({
      id: 'T1',
      userId: 'OTHER',
    } as any);

    const res = await POST(req({ id: 'T1' }));
    expect(res.status).toBe(404);
  });

  it('T05: success -> 204', async () => {
    vi.mocked(prisma.syncToken.findUnique).mockResolvedValue({
      id: 'T1',
      userId: 'U1',
    } as any);

    const res = await POST(req({ id: 'T1' }));
    expect(res.status).toBe(204);
    expect(prisma.syncToken.delete).toHaveBeenCalledWith({ where: { id: 'T1' } });
  });
});
