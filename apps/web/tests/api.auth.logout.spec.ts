// tests/api.auth.logout.spec.ts
// ログアウト API (POST /api/auth/logout) のテスト
// 対応ドキュメント: docs/ja-JP/05_テストケース集/01_ユーザー認証API/api_auth_logout_testcases.md
//
// 想定テストケース:
//  API_AUTH_LOGOUT-TC-01: 正常に 200 + ok:true が返る
//  API_AUTH_LOGOUT-TC-02: セッションCookie が破棄される
//
// テスト方針:
//  - 現状の実装 (apps/web/src/app/api/auth/logout/route.ts) は、
//      - ステータス 200
//      - JSON { ok: true }
//      - セッション用 Cookie 名: sid
//    を返す実装になっているため、これに合わせて検証する。
//  - Cookie の詳細属性 (Path, HttpOnly, SameSite など) は実装依存のため、
//    ここでは「Cookie 名が hk_token で、値が消される方向（Max-Age=0 など）」を確認する。

import { describe, it, expect } from 'vitest';
import { POST as POST_LOGOUT } from '@/app/api/auth/logout/route';

describe('POST /api/auth/logout', () => {
  const url = 'http://localhost/api/auth/logout';

  it('API_AUTH_LOGOUT-TC-01: 正常に 200 + ok:true が返る', async () => {
    const req = new Request(url, {
      method: 'POST',
    });

    const res = await POST_LOGOUT(req);
    expect(res.status).toBe(200);

    const json = await res.json() as any;
    expect(json).toMatchObject({
      ok: true,
    });
  });

  it('API_AUTH_LOGOUT-TC-02: セッションCookie が破棄される', async () => {
    const req = new Request(url, {
      method: 'POST',
    });

    const res = await POST_LOGOUT(req);
    const setCookie = res.headers.get('Set-Cookie') ?? '';

    // 実装上のセッションCookie名は sid
    expect(setCookie).toMatch(/sid=/);

    // 値が破棄される方向に設定されていることを確認
    // - Max-Age=0 または Expires= 過去日 など
    // 実装では Max-Age=0 が使われているため、ここでは Max-Age=0 の有無を確認
    expect(setCookie).toMatch(/Max-Age=0/);
  });

  it('API_AUTH_LOGOUT-TC-03: 多重ログアウト（idempotent）', async () => {
    const req1 = new Request(url, { method: 'POST' });
    const res1 = await POST_LOGOUT(req1);

    expect(res1.status).toBe(200);
    const json1 = await res1.json() as any;
    expect(json1).toMatchObject({ ok: true });

    const req2 = new Request(url, { method: 'POST' });
    const res2 = await POST_LOGOUT(req2);

    expect(res2.status).toBe(200);
    const json2 = await res2.json() as any;
    expect(json2).toMatchObject({ ok: true });
  });

});
