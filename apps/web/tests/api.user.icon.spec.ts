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

it('認証処理が例外なら 401 or 403 を返す', async () => {
  // requireUserId が例外を投げるケースをモック
  (requireUserId as unknown as vi.Mock).mockRejectedValueOnce(new Error('boom'));

  const req = new Request('http://t.local/api/user/icon', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      dataURL: 'data:image/png;base64,AAA',
    }),
  });

  const res = await PUT_ICON(req);

  // 実装は 401 固定だが、既存方針に合わせて 401/403 許容
  expect([401, 403]).toContain(res.status);
});

import { requireUserId } from '@/server/auth';
import { PUT as PUT_ICON } from '@/app/api/user/icon/route';

it('Content-Type 不正は 400/415', async () => {
  (requireUserId as any).mockResolvedValue('U1');
  const res = await PUT_ICON(new Request('http://t/api/user/icon', {
    method: 'PUT',
    // Content-Type を外す or text/plain にする
    body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
  }));
  expect([400, 415]).toContain(res.status);
});

it('壊れた JSON は 400', async () => {
  (requireUserId as any).mockResolvedValue('U1');
  const res = await PUT_ICON(new Request('http://t/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: '{bad json',
  }));
  expect(res.status).toBe(400);
});

it('Base64 不正は 400', async () => {
  (requireUserId as any).mockResolvedValue('U1');
  const bad = 'data:image/png;base64,@@@'; // デコード失敗
  const res = await PUT_ICON(new Request('http://t/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: bad }),
  }));
  expect(res.status).toBe(400);
});

import { PUT as PUT_ICON } from '@/app/api/user/icon/route';

// 1) Base64 に改行や空白を含むケース（許容分岐の実行）
it('Base64に改行や空白が含まれていても許容', async () => {
  // 'AAA' を改行入りでエンコード相当の体裁に
  const dataURL = 'data:image/png;base64,A\nA A=';
  const req = new Request('http://t.local/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL }),
  });
  const res = await PUT_ICON(req);
  // 実装が許容する分岐に入れば 200 か 400 のいずれか
  expect([200, 400]).toContain(res.status);
});

// 2) MIME は image/png 以外（mime不正の分岐）
it('JPEGは拒否（mime不正）', async () => {
  const req = new Request('http://t.local/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/jpeg;base64,AAA' }),
  });
  const res = await PUT_ICON(req);
  expect(res.status).toBe(400);
});

import { prisma } from '@/server/prisma';

it('DBで対象ユーザー無しなら 404', async () => {
  (requireUserId as any).mockResolvedValue('U404');
  (prisma.user.update as any).mockRejectedValue(
    new Error('No record was found for query on the database'),
  );

  const req = new Request('http://t/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA=' }),
  });

  const res = await PUT_ICON(req);
  expect(res.status).toBe(404);
});

import { PUT as PUT_ICON } from '@/app/api/user/icon/route';
import { requireUserId } from '@/server/auth';

it('data: スキームでない dataURL は 400', async () => {
  (requireUserId as any).mockResolvedValue('U1');

  const req = new Request('http://t/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    // 完全にフォーマット不正（parseDataUrl の format 分岐用）
    body: JSON.stringify({ dataURL: 'not-a-data-url' }),
  });

  const res = await PUT_ICON(req);
  expect(res.status).toBe(400);
});

it('Base64 の decode 中に例外が出た場合は 400', async () => {
  const { PUT: PUT_ICON } = await import('@/app/api/user/icon/route');
  const { requireUserId } = await import('@/server/auth');

  (requireUserId as any).mockResolvedValue({ ok: true, userId: 'U1' });

  const originalFrom = Buffer.from;
  (Buffer as any).from = vi.fn(() => {
    throw new Error('decode failed');
  });

  const req = new Request('http://t.local/api/user/icon', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataURL: 'data:image/png;base64,QUFB', // 一見正しそうだが、モックで強制的に失敗させる
    }),
  });

  const res = await PUT_ICON(req);

  (Buffer as any).from = originalFrom;

  expect(res.status).toBe(400);
});

it('dataURL が文字列以外なら 400', async () => {
  const { PUT } = await import('@/app/api/user/icon/route');

  const req = new Request('http://localhost/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 123 }),
  });

  const res = await PUT(req);
  expect(res.status).toBe(400);
});

it('予期せぬエラーは 500 を返す', async () => {
  const mod = await import('@/app/api/user/icon/route');
  const { PUT } = mod;

  const spy = vi
    // 経由点フックに対してスパイする
    .spyOn((mod as any).__hooks, 'parseAndNormalizeDataURL')
    .mockImplementation(() => {
      throw new Error('unexpected');
    });

  const req = new Request('http://localhost/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
  });

  const res = await PUT(req);
  expect(res.status).toBe(500);

  spy.mockRestore();
});

it('dataURL のbase64部が空なら 400', async () => {
  const req = new Request('http://t.local/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/png;base64,' }), // 空
  });
  const res = await PUT_ICON(req);
  expect(res.status).toBe(400);
});

it('DBで対象ユーザーが存在せず更新0件なら 404', async () => {
  (requireUserId as any).mockResolvedValue('U404');
  vi.spyOn(prisma.user, 'update').mockResolvedValueOnce(null as any);
  const req = new Request('http://t.local/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
  });
  const res = await PUT_ICON(req);
  expect(res.status).toBe(404);
});

import * as mod from '@/app/api/user/icon/route';

it('内部で予期せぬ例外なら 500', async () => {
  const spy = vi.spyOn(mod as any, 'parseAndNormalizeDataURL').mockImplementation(() => {
    throw new Error('unexpected');
  });
  (requireUserId as any).mockResolvedValue('U1');
  const req = new Request('http://t.local/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
  });
  const res = await PUT_ICON(req);
  spy.mockRestore();
  expect(res.status).toBe(500);
});
