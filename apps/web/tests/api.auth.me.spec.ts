import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma as prismaMock } from '@/__mocks__/prisma';
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }), { virtual: true });

import { GET as GET_ME } from '@/app/api/auth/me/route';

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('GET /api/auth/me', () => {
  it('ログイン済みなら user を返す', async () => {
    const { readSession } = await import('@/server/auth');
    (readSession as any).mockResolvedValue({
      ok: true,
      user: { id: 'U1', userName: 'Alice', iconDataUrl: null },
    });

    const res = await GET_ME(new Request('http://test.local/api/auth/me'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user?.id).toBe('U1');
  });

  it('未ログインなら 401 or ok:false を返す（実装に合わせる）', async () => {
    const { readSession } = await import('@/server/auth');
    (readSession as any).mockResolvedValue({ ok: false, user: null });

    const res = await GET_ME(new Request('http://test.local/api/auth/me'));
    const body = await res.json().catch(() => ({}));
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) expect(body.ok).toBe(false);
  });
});
