import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1) 先にモックを宣言（重要：これより後の import がモック版を見る）
vi.mock('@/server/prisma', async () => {
  const { prisma } = await import('@/__mocks__/prisma');
  return { prisma };
});

vi.mock('@/server/auth', () => ({
  requireUserId: vi.fn(), // 各ケースで返り値を設定
}));

// 2) ルートを import（上の vi.mock が効く）
import { PUT as PUT_ICON } from '@/app/api/user/icon/route';

describe('PUT /api/user/icon', () => {
  const { prisma } = require('@/server/prisma');
  const { requireUserId } = require('@/server/auth');

  beforeEach(() => {
    vi.clearAllMocks();

    // デフォルトは「ログイン済み」
    (requireUserId as any).mockResolvedValue('U1');

    // user.update の既定解答（成功ルート）
    (prisma.user.update as any).mockResolvedValue({
      id: 'U1',
      displayName: 'User1',
      iconDataUrl: 'data:image/png;base64,AAA',
    });
  });

  it('dataURL を保存し、{ ok:true, me } を返す', async () => {
    const req = new Request('http://localhost/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.me?.id).toBe('U1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'U1' },
      data: { iconDataUrl: 'data:image/png;base64,AAA' },
      select: { id: true, displayName: true, iconDataUrl: true },
    });
  });

  it('未ログインは 401/403 相当', async () => {
    (requireUserId as any).mockResolvedValue(null); // 認証なしにする

    const req = new Request('http://localhost/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
    });

    const res = await PUT_ICON(req);
    expect([401, 403]).toContain(res.status);
  });
});
