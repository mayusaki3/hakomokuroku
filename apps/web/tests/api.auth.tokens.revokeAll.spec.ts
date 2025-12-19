// tests/api.auth.tokens.revokeAll.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/auth/tokens/revokeAll/route';
import { NextRequest } from 'next/server';

vi.mock('@/server/auth', () => ({
  requireUserId: vi.fn(),
}));

vi.mock('@/server/prisma', () => ({
  prisma: {
    syncToken: {
      deleteMany: vi.fn(),
    },
  },
}));

import { requireUserId } from '@/server/auth';
import { prisma } from '@/server/prisma';

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/auth/tokens/revokeAll', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: '{}',
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireUserId).mockResolvedValue('U1');
});

describe('POST /api/auth/tokens/revokeAll', () => {
  it('T01: Content-Type invalid -> 400', async () => {
    const r = new NextRequest('http://x', { method: 'POST' });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it('T02: success -> 204', async () => {
    const res = await POST(req());
    expect(res.status).toBe(204);
    expect(prisma.syncToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'U1' },
    });
  });
});
