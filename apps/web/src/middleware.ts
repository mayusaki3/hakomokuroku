// apps/web/src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 認証不要パス
  const ALLOW = [
    '/auth',
    '/help',          // ← 追加：ヘルプ配下は誰でもOK
    '/favicon.ico',
    '/robots.txt',
    '/manifest.webmanifest',
    '/site.webmanifest',
    '/icons',                 // PWA用アイコンパスをまとめて許可（必要なら調整）
    '/apple-touch-icon.png',
  ];
  if (
    pathname.startsWith('/api/') ||               // APIは各自で401
    pathname.startsWith('/_next/') ||             // 静的
    pathname.startsWith('/static/') ||
    ALLOW.some(p => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next();
  }

  // ガード：Cookieに hk_token が無ければ /auth へ
  const token = req.cookies.get('hk_token')?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('next', pathname + (search || ''));
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // /help を除外（/api, /_next, /auth なども除外）
  matcher: ['/((?!api|_next|favicon\\.ico|robots\\.txt|auth|help).*)'],
};
