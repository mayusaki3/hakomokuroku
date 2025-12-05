// apps/web/tests/api.settings.user.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 認証モジュールをモック
vi.mock('@/server/auth', () => ({
  getUser: vi.fn(),
  requireUserId: vi.fn(),
}));

import { GET as GET_USER, PUT as PUT_USER } from '@/app/api/settings/user/route';
import { prisma } from '@/server/prisma';
import { getUser, requireUserId } from '@/server/auth';

beforeEach(() => {
  vi.clearAllMocks();
});

//
// GET /api/settings/user
//
describe('GET /api/settings/user', () => {
  /**
   * API_SETTINGS_USER-TC-01 正常
   * - 条件: ログイン中
   * - 期待: 200, ok:true, user が返る
   */
  it('API_SETTINGS_USER-TC-01: ログイン中なら 200 + ok:true + user', async () => {
    // 認証済みユーザー
    (getUser as any).mockResolvedValue({
      user: { id: 'U1' },
    });

    // DB からユーザー情報が取得できる想定
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'U1',
      displayName: 'Alice',
    });

    // GET は引数なし想定（実装に合わせて調整可）
    const res = await GET_USER();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user?.id).toBe('U1');
    expect(body.user?.displayName).toBe('Alice');
  });

  /**
   * API_SETTINGS_USER-TC-02 未ログイン
   * - 条件: セッションなし
   * - 期待: 401
   */
  it('API_SETTINGS_USER-TC-02: 未ログインなら 401', async () => {
    // セッションなし
    (getUser as any).mockResolvedValue({ user: null });

    const res = await GET_USER();
    expect(res.status).toBe(401);
  });

  /**
   * API_SETTINGS_USER-TC-03 内部例外
   * - 条件: prisma が例外
   * - 期待: 500
   */
  it('API_SETTINGS_USER-TC-03: DB 例外なら 500', async () => {
    (getUser as any).mockResolvedValue({ user: { id: 'U1' } });
    (prisma.user.findUnique as any).mockRejectedValue(new Error('db error'));

    const res = await GET_USER();
    expect([500, 503]).toContain(res.status);
  });
});

//
// PUT /api/settings/user
//
describe('PUT /api/settings/user', () => {
  /**
   * API_SETTINGS_USER-TC-10 正常更新
   * - 条件: displayName="abc"
   * - 期待: 200, ok:true
   */
  it('API_SETTINGS_USER-TC-10: displayName を正常更新できる', async () => {
    (requireUserId as any).mockResolvedValue('U1');
    (prisma.user.update as any).mockResolvedValue({
      id: 'U1',
      displayName: 'abc',
    });

    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'abc' }),
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  /**
   * API_SETTINGS_USER-TC-11 バリデーションエラー
   * - 条件: displayName=""
   * - 期待: 400
   */
  it('API_SETTINGS_USER-TC-11: displayName 空文字は 400', async () => {
    (requireUserId as any).mockResolvedValue('U1');

    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '' }),
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(400);
  });

  /**
   * API_SETTINGS_USER-TC-12 未ログイン
   * - 条件: Cookieなし
   * - 期待: 401
   */
  it('API_SETTINGS_USER-TC-12: 未ログインは 401', async () => {
    (requireUserId as any).mockResolvedValue(null);

    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'abc' }),
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(401);
  });

  /**
   * API_SETTINGS_USER-TC-13 内部例外
   * - 条件: prisma が例外
   * - 期待: 500
   */
  it('API_SETTINGS_USER-TC-13: DB 更新例外は 500', async () => {
    (requireUserId as any).mockResolvedValue('U1');
    (prisma.user.update as any).mockRejectedValue(new Error('db error'));

    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'abc' }),
    });

    const res = await PUT_USER(req);
    expect([500, 503]).ToContain(res.status);
  });
});
