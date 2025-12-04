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
  // AUTH_ME-TC-01 正常（ログイン中）
  it('AUTH_ME-TC-01: ログイン済みなら user を返す', async () => {
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

  // AUTH_ME-TC-02 未ログイン
  it('AUTH_ME-TC-02: 未ログインなら 200 + ok:false（仕様準拠）', async () => {
    // 未ログイン想定: readSession から ok:false が返る
    (readSession as any).mockResolvedValue({ ok: false, user: null });

    const res = await GET_ME(new Request('http://test.local/api/auth/me'));
    const body = await res.json();

    // エラー仕様詳細 / セッション仕様に合わせて 200 固定
    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
  });
});

// AUTH_ME-TC-03 readSession が例外
// 例外が発生しても 200 + ok:false を返す（仕様固定）
it('AUTH_ME-TC-03: readSession が例外でも 200 + ok:false（実装準拠）', async () => {
  (readSession as any).mockRejectedValue(new Error('boom'));

  const res = await GET_ME(new Request('http://t.local/api/auth/me'));
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.ok).toBe(false);
});

// AUTH_ME-TC-04 ok:true かつ user:null の挙動
// 仕様上は未定義だが、防御的実装の分岐としてテストしておく。
it('AUTH_ME-TC-04: ok:true かつ user:null の挙動', async () => {
  (readSession as any).mockResolvedValue({ ok: true, user: null });

  const res = await GET_ME(new Request('http://t.local/api/auth/me'));
  const body = await res.json().catch(() => ({}));

  // 実装によって 200 or 401 を許容（将来 200 に統一するならここも修正）
  expect([200, 401]).toContain(res.status);
  if (res.status === 200) {
    expect(body.ok).toBe(false);
  }
});
