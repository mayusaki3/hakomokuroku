// apps/web/tests/api.user.icon.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Prisma はグローバルセットアップでモック済み
// 認証だけ各ケースで上書き可能にする
vi.mock('@/server/auth', () => ({
  requireUserId: vi.fn(),
}));

import { PUT as PUT_ICON } from '@/app/api/user/icon/route';
import { prisma } from '@/server/prisma';           // モック済み実体
import { requireUserId } from '@/server/auth';      // モック関数

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PUT /api/user/icon', () => {
  it('dataURL を保存し、{ ok:true, me } を返す', async () => {
    (requireUserId as any).mockResolvedValue('U1');
    (prisma.user.update as any).mockResolvedValue({
      id: 'U1',
      displayName: 'User1',
      iconDataUrl: 'data:image/png;base64,AAA',
    });

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
    (requireUserId as any).mockResolvedValue(null);

    const req = new Request('http://localhost/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
    });

    const res = await PUT_ICON(req);
    expect([401, 403]).toContain(res.status);
  });
});

import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';
import { PUT as PUT_ICON } from '@/app/api/user/icon/route';

// 入力エラー分岐（dataURL 未指定）
it('dataURL 未指定は 400', async () => {
  (requireUserId as any).mockResolvedValue('U1');
  const req = new Request('http://t.local/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}), // dataURL なし
  });
  const res = await PUT_ICON(req);
  expect(res.status).toBe(400);
});

// DB更新失敗→catchへ
it('DB 更新失敗は 500 系', async () => {
  (requireUserId as any).mockResolvedValue('U1');
  (prisma.user.update as any).mockRejectedValue(new Error('db error'));
  const req = new Request('http://t.local/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
  });
  const res = await PUT_ICON(req);
  expect([500, 503]).toContain(res.status);
});

import { requireUserId } from '@/server/auth';
import { PUT as PUT_ICON } from '@/app/api/user/icon/route';

it('dataURL が不正形式（例: text/plain）なら 400', async () => {
  (requireUserId as any).mockResolvedValue('U1');
  const bad = 'data:text/plain;base64,QUFB'; // 画像MIMEでない
  const res = await PUT_ICON(new Request('http://t/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: bad }),
  }));
  expect(res.status).toBe(400);
});
import { requireUserId } from '@/server/auth';
import { PUT as PUT_ICON } from '@/app/api/user/icon/route';

// 未ログインなら 401/403（実装に合わせる）
it('未ログインは 401 or 403 を返す', async () => {
  (requireUserId as any).mockResolvedValue(null); // または undefined
  const req = new Request('http://t.local/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
  });
  const res = await PUT_ICON(req);
  expect([401, 403]).toContain(res.status);
});
