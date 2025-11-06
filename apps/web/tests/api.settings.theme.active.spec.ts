import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1) 先にモック
vi.mock('@/server/prisma', async () => {
  const { prisma } = await import('@/__mocks__/prisma');
  return { prisma };
});
vi.mock('@/server/auth', () => ({
  getUser: vi.fn(),
}));

// 2) ルート import
import { GET as GET_ACTIVE } from '@/app/api/settings/theme/active/route';

describe('GET /api/settings/theme/active', () => {
  const { prisma } = require('@/server/prisma');
  const { getUser } = require('@/server/auth');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未ログインでも 200 + 既定テーマ', async () => {
    (getUser as any).mockResolvedValue({ user: null });

    const res = await GET_ACTIVE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.active?.themeId).toBe('default');
  });

  it('ログイン済みは DB のアクティブテーマを返す', async () => {
    (getUser as any).mockResolvedValue({ user: { id: 'U1' } });
    (prisma.themeActive.findUnique as any).mockResolvedValue({ themeId: 'T1' });

    const res = await GET_ACTIVE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.active?.themeId).toBe('T1');
  });
});
