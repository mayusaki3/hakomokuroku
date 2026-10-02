// apps/web/src/middleware.ts
// 未認証の通常画面アクセスをログインへ誘導する。
// 認証API・認証画面・Help・Next.js静的資産は未認証でも利用可能とする。

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PREFIXES = [
  '/auth',
  '/help',
  '/api/auth',
  '/api/health',
  '/_next',
  '/icons',
  '/favicon.ico',
  '/robots.txt',
  '/manifest.webmanifest',
];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 公開領域は認証状態にかかわらず通す。
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // 通常画面はセッションCookieが無ければログインから開始する。
  if (!req.cookies.get('sid')?.value && !pathname.startsWith('/api/')) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth';
    url.search = '';
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/health).*)'],
};
