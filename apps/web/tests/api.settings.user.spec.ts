// apps/web/tests/api.settings.user.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { GET as GET_USER, PUT as PUT_USER } from '@/app/api/settings/user/route';
import { prisma } from '@/lib/prisma';
import { readSession, requireUserId } from '@/server/auth';

vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      user: {
        findFirst: vi.fn(), // ★ GET 用
        update: vi.fn(),    // ★ PUT 用
      },
    },
  };
});

vi.mock('@/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/auth')>();
  return {
    ...actual,
    readSession: vi.fn(),      // GET/PUT 共通のセッション stub 用
    requireUserId: vi.fn(),    // PUT /api/settings/user の認証 stub 用
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const mockedReadSession = readSession as unknown as vi.Mock;
const mockedFindFirst = prisma.user.findFirst as unknown as vi.Mock;
const mockedUpdate = prisma.user.update as unknown as vi.Mock;
const mockedRequireUserId = requireUserId as unknown as vi.Mock;

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
    // セッションはログイン中
    (readSession as any).mockResolvedValue({
      user: { id: 'U1' },
    });

    // DB からユーザー情報取得（route.ts の select に合わせる）
    (prisma.user.findFirst as any).mockResolvedValue({
      id: 'U1',
      userId: 'alice',
      userName: 'Alice',
      iconDataUrl: 'data:image/png;base64,xxx',
      totpEnabled: true,
      isActive: true,
    });

    const res = await GET_USER();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({
      id: 'U1',
      userId: 'alice',
      userName: 'Alice',
      iconDataUrl: 'data:image/png;base64,xxx',
      totpEnabled: true,
    });
  });

  /**
   * API_SETTINGS_USER-TC-02 未ログイン
   * - 条件: セッションなし
   * - 期待: 401
   */
  it('API_SETTINGS_USER-TC-02: 未ログインなら 401', async () => {
    // セッションなし
    (readSession as any).mockResolvedValue({ user: null });

    const res = await GET_USER();
    expect(res.status).toBe(401);
  });

  it('API_SETTINGS_USER-TC-03: DB 例外なら 500', async () => {
    (readSession as any).mockResolvedValue({
      user: { id: 'U1' },
    });
    (prisma.user.findFirst as any).mockRejectedValue(new Error('db error'));

    const res = await GET_USER();
    expect(res.status).toBe(500);
  });

  /**
   * API_SETTINGS_USER-TC-04: セッションあり + DB ユーザーなしは 404
   *
   * 条件:
   *  - readSession で user.id が返る
   *  - prisma.user.findFirst が null を返す（isActive=false などで除外された状態）
   *
   * 期待:
   *  - HTTP 404
   *  - body = { ok: false, user: null }
   */
  it('API_SETTINGS_USER-TC-04: セッションあり + DB ユーザーなしは 404', async () => {
    (readSession as any).mockResolvedValue({
      user: { id: 'U1' },
    });

    // DB に有効ユーザーが存在しないケース
    (prisma.user.findFirst as any).mockResolvedValue(null);

    const res = await GET_USER();

    expect(res.status).toBe(404);
    const body = await res.json();

    expect(body).toEqual({
      ok: false,
      user: null,
    });
  });

  it('API_SETTINGS_USER-TC-05: userName / iconDataUrl が null でも 200 + ok:true + userName/iconDataUrl:null', async () => {
    // セッションは存在する
    (readSession as any).mockResolvedValue({
      user: { id: 'U1' },
    });

    // DB 上の userName / iconDataUrl が null のケース
    (prisma.user.findFirst as any).mockResolvedValue({
      id: 'U1',
      userId: 'alice',
      userName: null,
      iconDataUrl: null,
      totpEnabled: false,
    });

    const res = await GET_USER();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({
      id: 'U1',
      userId: 'alice',
      userName: null,        // ← userName ?? null の「左辺 nullish」
      iconDataUrl: null,     // ← iconDataUrl ?? null の「左辺 nullish」
      totpEnabled: false,    // ← !!u.totpEnabled の false 側も通る
    });
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
    mockedReadSession.mockResolvedValue({ user: { id: 'U1' } });

    // update の戻り値は route.ts 側で使っていないので何でもよい
    mockedUpdate.mockResolvedValue({ id: 'U1' });

    const req = new Request('http://localhost/api/settings/user', {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Alice' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: 'U1' },
      data: { userName: 'Alice' },
    });
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
    mockedReadSession.mockResolvedValue({ user: null }); // ★ 未ログイン

    const req = new Request('http://localhost/api/settings/user', {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Alice' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(401);

    // prisma.user.update は呼ばれない想定
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  /**
   * API_SETTINGS_USER-TC-13 内部例外
   * - 条件: prisma が例外
   * - 期待: 500
   */
  it('API_SETTINGS_USER-TC-13: DB 更新例外は 500', async () => {
    mockedReadSession.mockResolvedValue({ user: { id: 'U1' } });
    mockedUpdate.mockRejectedValue(new Error('db error'));

    const req = new Request('http://localhost/api/settings/user', {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Alice' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect([500, 503]).toContain(res.status); // ← 小文字 toContain
  });

  it('API_SETTINGS_USER-TC-14: displayName 未指定は 400', async () => {
    // ログイン済みとして userId を返す
    (requireUserId as any).mockResolvedValue('U1');

    // displayName フィールドが無い JSON を送る
    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      body: JSON.stringify({}), // ← body.displayName が undefined
      headers: { 'content-type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(400);

    // Prisma.update は呼ばれない想定
    expect(prisma.user.update as any).not.toHaveBeenCalled();
  });

  it('API_SETTINGS_USER-TC-15: JSON パースエラーなら 400', async () => {
    (readSession as any).mockResolvedValue({ user: { id: 'U1' } });

    // ボディが壊れた JSON → req.json() が reject して catch(() => null) が実行される
    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      body: '{ invalid-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toBe('displayName is required');
  });

});
