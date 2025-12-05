// apps/web/tests/api.user.icon.spec.ts
// ユーザーアイコン更新 API (PUT /api/user/icon) のテスト
// - 仕様書: docs/ja-JP/05_テストケース集/02_ユーザー情報API/api_user_icon_testcases.md
// - テスト番号: API_USER_ICON-TC-01 〜 TC-19

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 認証モジュールはモック可能にする
vi.mock('@/server/auth', () => ({
  requireUserId: vi.fn(),
}));

// Prisma クライアントもモックする
vi.mock('@/lib/db', () => {
  return {
    prisma: {
      user: {
        update: vi.fn(),
      },
    },
  };
});

import { PUT as PUT_ICON, __hooks, updateUserIcon } from '@/app/api/user/icon/route';
import { requireUserId } from '@/server/auth';
import { prisma } from '@/lib/db';

// 型が厳しいときに any キャストで逃がすためのエイリアス
const requireUserIdMock = requireUserId as unknown as vi.Mock;

// 各テスト前にモック状態をクリア
beforeEach(() => {
  vi.clearAllMocks();
});

describe('ユーザーアイコン更新 API (PUT /api/user/icon)', () => {
  /**
   * API_USER_ICON-TC-01 正常（PNG Base64）
   * - ログイン済み
   * - 有効な PNG dataURL 形式
   * - 200 + ok:true + me.iconUrl 更新
   */
  it('API_USER_ICON-TC-01: 正常（PNG Base64）', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockResolvedValue({ id: 'U1', iconUrl: '/icons/u1.png' } as any);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.me).toBeDefined();
    // iconUrl が何らかの値で更新されていることを確認（値自体は実装依存）
    expect(json.me.iconUrl).toBeDefined();

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-02 未ログイン（セッションなし）
   * - requireUserId が null/undefined を返す
   * - 401 or 403
   */
  it('API_USER_ICON-TC-02: 未ログイン（セッションなし）', async () => {
    requireUserIdMock.mockResolvedValue(null);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect([401, 403]).toContain(res.status);
  });

  /**
   * API_USER_ICON-TC-03 認証処理が例外
   * - requireUserId が例外を投げる
   * - 401 or 403
   */
  it('API_USER_ICON-TC-03: 認証処理が例外なら 401/403', async () => {
    requireUserIdMock.mockRejectedValue(new Error('auth boom'));

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect([401, 403]).toContain(res.status);
  });

  /**
   * API_USER_ICON-TC-04 icon 未指定
   * - body に icon フィールドが無い
   * - 400 + ok:false
   */
  it('API_USER_ICON-TC-04: icon 未指定は 400', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}), // icon なし
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  /**
   * API_USER_ICON-TC-05 icon が文字列以外
   * - icon: number など
   * - 400 + ok:false
   */
  it('API_USER_ICON-TC-05: icon が文字列以外なら 400', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 12345 }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  /**
   * API_USER_ICON-TC-06 Content-Type 不正／未定義
   * - Content-Type が application/json 以外、または取得不能
   * - 400 or 415
   */
  it('API_USER_ICON-TC-06: Content-Type 不正／未定義は 400/415', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    // Content-Type ヘッダ無し
    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect([400, 415]).toContain(res.status);
  });

  /**
   * API_USER_ICON-TC-07 壊れた JSON
   * - JSON.parse 不可能なボディ
   * - 400 + ok:false
   */
  it('API_USER_ICON-TC-07: 壊れた JSON は 400', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{bad json',
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  /**
   * API_USER_ICON-TC-08 data: スキームでない dataURL
   * - icon が "not-a-dataurl" など
   * - 400 + ok:false
   */
  it('API_USER_ICON-TC-08: data: スキームでない dataURL は 400', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'not-a-dataurl' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  /**
   * API_USER_ICON-TC-09 MIME 不正（text/plain / image/jpeg 等）
   * - data:text/plain..., data:image/jpeg... など
   * - 400 or 415
   */
  it('API_USER_ICON-TC-09: MIME 不正（text/plain / image/jpeg 等）は 400/415', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const badMimeList = [
      'data:text/plain;base64,AAAA',
      'data:image/jpeg;base64,BBBB',
    ];

    for (const icon of badMimeList) {
      const req = new Request('http://t/api/user/icon', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ icon }),
      });

      const res = await PUT_ICON(req);
      expect([400, 415]).toContain(res.status);
    }
  });

  /**
   * API_USER_ICON-TC-10 Base64 不正
   * - Base64 として decode 出来ない文字列
   * - 400 + ok:false
   */
  it('API_USER_ICON-TC-10: Base64 不正は 400', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        icon: 'data:image/png;base64,@@@INVALID@@@',
      }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  /**
   * API_USER_ICON-TC-11 Base64 decode 中に例外
   * - decode 処理が例外を投げるようにモック
   * - 400 + ok:false
   */
  it('API_USER_ICON-TC-11: Base64 decode 中に例外なら 400', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    // Buffer.from をモックして decode 中に例外を発生させる
    const originalFrom = Buffer.from;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Buffer as any).from = vi.fn(() => {
      throw new Error('decode failed');
    });

    try {
      const req = new Request('http://t/api/user/icon', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          icon: 'data:image/png;base64,QUFB', // 一見正しい Base64
        }),
      });

      const res = await PUT_ICON(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.ok).toBe(false);
    } finally {
      // 他テストへの影響を防ぐため必ず復元
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Buffer as any).from = originalFrom;
    }
  });

  /**
   * API_USER_ICON-TC-12 Base64 部分が空
   * - data:image/png;base64, （末尾カンマのみ）
   * - 400 + ok:false
   */
  it('API_USER_ICON-TC-12: Base64 部分が空なら 400', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        icon: 'data:image/png;base64,',
      }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  /**
   * API_USER_ICON-TC-13 Base64 に改行・空白が含まれていても許容
   * - 改行や空白を含む Base64
   * - 200 + ok:true
   */
  it('API_USER_ICON-TC-13: Base64 に改行・空白が含まれていても許容', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockResolvedValue({ id: 'U1', iconUrl: '/icons/u1.png' } as any);

    const icon =
      'data:image/png;base64,QUFB\nQkJC   Q0ND'; // "AAABB BCC" 的なダミー

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-14 DB 更新成功（updateMany count>0）
   * - updateUserIcon が「正常に更新されたユーザー」を返す
   * - 200 + ok:true
   */
  it('API_USER_ICON-TC-14: DB 更新成功なら 200', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockResolvedValue({ id: 'U1', iconUrl: '/icons/u1.png' } as any);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-15 DB 更新失敗（汎用エラー）
   * - updateUserIcon が一般的な Error を投げる
   * - 500 + ok:false + error: internal_error
   */
  it('API_USER_ICON-TC-15: DB 更新時に汎用エラーなら 500', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const err = new Error('db error');
    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockRejectedValue(err);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.ok).toBe(false);
    // エラーコードはエラー仕様詳細に合わせて internal_error を期待
    expect(json.error).toBe('internal_error');

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-16 updateUserIcon が null を返す
   * - 更新結果が null（想定外）
   * - 500 + ok:false + internal_error
   */
  it('API_USER_ICON-TC-16: updateUserIcon が null を返したら 500', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockResolvedValue(null as any);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('internal_error');

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-17 DBエラー not-found 系（ユーザー無し）
   * - name=NotFoundError / meta.cause / P2025 / count=0 等を not-found とみなす
   * - 404 + ok:false + error: not_found
   */
  it('API_USER_ICON-TC-17: DBエラー not-found 系なら 404', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const err: any = new Error('record to update not found');
    err.name = 'NotFoundError';
    err.code = 'P2025';
    err.meta = { cause: 'record to update not found' };

    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockRejectedValue(err);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('not_found');

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-18 DBエラー not-found系以外
   * - not-found 判定に当てはまらない DB エラー
   * - 500 + ok:false + internal_error
   */
  it('API_USER_ICON-TC-18: DBエラー not-found系以外なら 500', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const err: any = new Error('some db error');
    err.code = 'P9999'; // not-found ではないコード想定

    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockRejectedValue(err);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('internal_error');

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-19 内部で予期せぬ例外
   * - ハンドラ内部で想定外の例外が発生
   * - 500 + ok:false + internal_error
   */
  it('API_USER_ICON-TC-19: 内部で予期せぬ例外なら 500', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    // updateUserIcon が同期的に例外を投げるケースを想定
    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockImplementation(() => {
        throw new Error('unexpected');
      });

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('internal_error');

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-20 dataURL フォーマット不正（;base64, 区切りなし）
   * - data:image/png,AAAA のように ";base64," がない
   * - 400 + ok:false （BAD_FORMAT）
   */
  it('API_USER_ICON-TC-20: dataURL フォーマット不正（;base64, 区切りなし）は 400', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        // startsWith('data:') だが ";base64," 形式ではない → BAD_FORMAT
        icon: 'data:image/png,AAAA',
      }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.ok).toBe(false);
    // 必要であればメッセージも確認（route.ts に合わせて）
    // expect(json.error).toBe('invalid dataURL');
  });

  /**
   * API_USER_ICON-TC-21 updateMany で count=0 の場合は 404
   * - updateUserIcon が { count: 0 } を返すケース
   * - 404 + ok:false + error: not updated
   */
  it('API_USER_ICON-TC-21: updateMany count=0 なら 404', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockResolvedValue({ count: 0 } as any);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        icon: 'data:image/png;base64,AAAA',
      }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.ok).toBe(false);
    // route.ts の実装に合わせる
    expect(json.error).toBe('not_found');

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-22 parseAndNormalizeDataURL が例外なら 500
   * - dataURL 正常でも parseAndNormalizeDataURL が throw した場合
   * - 500 + ok:false + internal_error
   */
  it('API_USER_ICON-TC-22: parseAndNormalizeDataURL が例外なら 500', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    // parseAndNormalizeDataURL を例外を投げる実装に差し替え
    const parseSpy = vi
      .spyOn(__hooks, 'parseAndNormalizeDataURL')
      .mockImplementation(() => {
        throw new Error('parse failed');
      });

    try {
      const req = new Request('http://t/api/user/icon', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
      });

      const res = await PUT_ICON(req);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe('internal_error');
    } finally {
      // ここで必ず元の実装に戻す
      parseSpy.mockRestore();
    }
  });

  /**
   * API_USER_ICON-TC-23 updateMany count>0
   * - updateUserIcon が { count: >0 } を返すパターン
   * - route.ts の実装では成功扱い（200）
   */
  it('API_USER_ICON-TC-23: updateMany count>0 なら 200', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockResolvedValue({ count: 1 } as any);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-24 DBエラー name=NotFoundError のみ
   * - route.ts の実装では not-found 判定され 404
   */
  it('API_USER_ICON-TC-24: DBエラー name=NotFoundError のみなら 404', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const err: any = new Error('some db error');
    err.name = 'NotFoundError';

    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockRejectedValue(err);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('not_found');

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-25 DBエラー message のみが not found を含む
   * - route.ts の実装では not-found 判定され 404
   */
  it('API_USER_ICON-TC-25: DBエラー message のみが not found を含んでも 404', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const err: any = new Error('record not found in db');
    // code や meta は付けない（message のみ not found）
    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      .mockRejectedValue(err);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('not_found');

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-26 Content-Type が application/json 以外(text/plain)
   * - Content-Type はあるが application/json ではない
   * - 400 or 415
   */
   it('API_USER_ICON-TC-26: Content-Type text/plain なら 400/415', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' }, // ヘッダありだが不正
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect([400, 415]).toContain(res.status);
  });

  /**
   * API_USER_ICON-TC-27 DBエラー err が非オブジェクト
   * - isNotFoundError のフォールバック枝を通す想定
   * - 500 + ok:false + internal_error
   */
  it('API_USER_ICON-TC-27: DBエラー err が非オブジェクトでも 500', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const updateSpy = vi
      .spyOn(__hooks, 'updateUserIcon')
      // 非オブジェクトを投げる
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockRejectedValue('some error' as any);

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    const res = await PUT_ICON(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('internal_error');

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * API_USER_ICON-TC-28 Base64 decode が空バッファを返す場合
   * - Buffer.from が長さ 0 の Buffer を返す
   * - BAD_BASE64 判定となり 400 + ok:false
   */
  it('API_USER_ICON-TC-28: Base64 decode が空バッファなら 400', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const originalFrom = Buffer.from;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Buffer as any).from = vi.fn(() => Buffer.alloc(0));

    try {
      const req = new Request('http://t/api/user/icon', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // 一見正常な dataURL（Base64 部分はなんでもよい）
          icon: 'data:image/png;base64,QUFB',
        }),
      });

      const res = await PUT_ICON(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.ok).toBe(false);
    } finally {
      // 他テストへの影響を防ぐため必ず復元
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Buffer as any).from = originalFrom;
    }
  });

  /**
   * API_USER_ICON-TC-29: Content-Type ヘッダなしは 400
   */
  it('API_USER_ICON-TC-29: Content-Type ヘッダなしは 400', async () => {
    requireUserIdMock.mockResolvedValue('U1');

    const req = new Request('http://t/api/user/icon', {
      method: 'PUT',
      body: JSON.stringify({ icon: 'data:image/png;base64,AAAA' }),
    });

    // ここがポイント：自動で付与された Content-Type を削除
    req.headers.delete('content-type');

    const res = await PUT_ICON(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('unsupported content-type');
  });

});

describe('updateUserIcon 単体', () => {
  /**
   * API_USER_ICON-UT-01 prisma.user.update を正しく呼び出す
   */
  it('API_USER_ICON-UT-01: prisma.user.update を正しく呼び出す', async () => {
    const userId = 'U1';
    const dataURL = 'data:image/png;base64,AAAA';

    // モックされた prisma.user.update を取得
    const prismaUpdateMock = prisma.user.update as unknown as vi.Mock;

    // 戻り値も適当にモック
    prismaUpdateMock.mockResolvedValue({
      id: userId,
      displayName: 'User 1',
      iconDataUrl: dataURL,
    } as any);

    const result = await updateUserIcon(userId, dataURL);

    expect(prismaUpdateMock).toHaveBeenCalledTimes(1);
    expect(prismaUpdateMock).toHaveBeenCalledWith({
      where: { id: userId },
      data: { iconDataUrl: dataURL },
      select: { id: true, displayName: true, iconDataUrl: true },
    });

    expect((result as any).id).toBe(userId);
  });
});
