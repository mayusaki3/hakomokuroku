// apps/web/tests/api.settings.theme.active.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Prisma はグローバルセットアップでモック済み
vi.mock('@/server/auth', () => ({
  getUser: vi.fn(),
}));

import { GET as GET_ACTIVE } from '@/app/api/settings/theme/active/route';
import { prisma } from '@/server/prisma'; // モック済み
import { getUser } from '@/server/auth'; // モック関数

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/settings/theme/active', () => {
  it('API_SETTINGS_THEME_ACTIVE-TC-01: 未ログインは既定テーマを返す', async () => {
    (getUser as any).mockResolvedValue({ user: null });
    (prisma.themeActive.findUnique as any).mockResolvedValue(null);

    const res = await GET_ACTIVE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // 実装の既定IDに合わせて調整（例: 'default'）
    expect(body.active?.themeId).toBe('default');
  });

  it('API_SETTINGS_THEME_ACTIVE-TC-02: ログイン済みは DB のアクティブテーマを返す', async () => {
    (getUser as any).mockResolvedValue({ user: { id: 'U1' } });
    (prisma.themeActive.findUnique as any).mockResolvedValue({ themeId: 'T1' });

    const res = await GET_ACTIVE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.active?.themeId).toBe('T1');
  });
});

// 未ログイン→既定テーマ（DB参照なしの分岐を通す）
it('API_SETTINGS_THEME_ACTIVE-TC-01: 未ログインは既定テーマを返す（ハンドラ直呼び）', async () => {
  (getUser as any).mockResolvedValue({ user: null });
  // 念のためDBは呼ばれない前提だが、呼ばれても null で良い
  (prisma.themeActive.findUnique as any).mockResolvedValue(null);

  const res = await GET_ACTIVE();
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.active?.themeId).toBe('default'); // 実装の既定に合わせる
});

it('API_SETTINGS_THEME_ACTIVE-TC-03: ログイン済み + DBなし → 既定テーマ', async () => {
  (getUser as any).mockResolvedValue({ user: { id: 'U1' } });
  (prisma.themeActive.findUnique as any).mockResolvedValue(null);
  const res = await GET_ACTIVE();
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.active?.themeId).toBe('default'); // 実装の既定値に合わせる
});

// DB例外→catchへ
it('API_SETTINGS_THEME_ACTIVE-TC-04: DB 例外は 500 系', async () => {
  (getUser as any).mockResolvedValue({ user: { id: 'U1' } });
  (prisma.themeActive.findUnique as any).mockRejectedValue(new Error('db error'));
  const res = await GET_ACTIVE();
  expect([500, 503]).toContain(res.status);
});
