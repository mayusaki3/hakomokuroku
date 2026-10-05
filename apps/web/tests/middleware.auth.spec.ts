// apps/web/tests/middleware.auth.spec.ts
// 起動時の認証導線を検証する。
// テスト番号: MIDDLEWARE_AUTH-TC-01 〜 MIDDLEWARE_AUTH-TC-04
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('middleware 起動時認証導線', () => {
  it('MIDDLEWARE_AUTH-TC-01: 未認証で / を開くと /auth へ遷移する', () => {
    const res = middleware(new NextRequest('http://localhost/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/auth?next=%2F');
  });

  it('MIDDLEWARE_AUTH-TC-02: next には元のpathとqueryを保持する', () => {
    const res = middleware(new NextRequest('http://localhost/boxes?q=usb'));
    expect(res.headers.get('location')).toBe('http://localhost/auth?next=%2Fboxes%3Fq%3Dusb');
  });

  it('MIDDLEWARE_AUTH-TC-03: sid があれば通常画面を通す', () => {
    const req = new NextRequest('http://localhost/', { headers: { cookie: 'sid=dummy' } });
    expect(middleware(req).headers.get('location')).toBeNull();
  });

  it('MIDDLEWARE_AUTH-TC-04: /auth は未認証でも通す', () => {
    expect(middleware(new NextRequest('http://localhost/auth')).headers.get('location')).toBeNull();
  });
});
