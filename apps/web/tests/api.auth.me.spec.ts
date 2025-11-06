// apps/web/tests/api.auth.me.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

// auth モジュールの readSession をモック
vi.mock('@/server/auth', () => ({
  readSession: vi.fn(),
}));

// ルートを読み込む（先のモックが有効）
import { GET as GET_ME } from '@/app/api/auth/me/route';
import { readSession } from '@/server/auth'; // モック関数を直接参照

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('GET /api/auth/me', () => {
  it('ログイン済みなら user を返す', async () => {
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
    (readSession as any).mockResolvedValue({ ok: false, user: null });

    const res = await GET_ME(new Request('http://test.local/api/auth/me'));
    const body = await res.json().catch(() => ({}));
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) expect(body.ok).toBe(false);
  });
});

import { readSession } from '@/server/auth';
import { GET as GET_ME } from '@/app/api/auth/me/route';

// 例外系（catchへ到達）
it('readSession が例外でも 200 + ok:false（実装準拠）', async () => {
  (readSession as any).mockRejectedValue(new Error('boom'));
  const res = await GET_ME(new Request('http://t.local/api/auth/me'));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.ok).toBe(false);
});

// 変則応答（ok:true かつ user:null）分岐も確認
it('ok:true かつ user:null の挙動', async () => {
  (readSession as any).mockResolvedValue({ ok: true, user: null });
  const res = await GET_ME(new Request('http://t.local/api/auth/me'));
  const body = await res.json().catch(() => ({}));
  expect([200, 401]).toContain(res.status);
  if (res.status === 200) expect(body.ok).toBe(false);
});
