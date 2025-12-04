// apps/web/tests/api.user.icon.spec.ts
// ユーザーアイコン更新 API (PUT /api/user/icon) のテスト
// - 仕様書: docs/ja-JP/05_テストケース集/02_ユーザー情報API/api_user_icon_testcases.md
// - テスト番号: API_USER_ICON-TC-01 〜 TC-19

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 認証モジュールはモック可能にする
vi.mock('@/server/auth', () => ({
  requireUserId: vi.fn(),
}));

import { PUT as PUT_ICON, __hooks } from '@/app/api/user/icon/route';
import { requireUserId } from '@/server/auth';

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
});
