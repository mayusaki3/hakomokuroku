// apps/web/src/middleware.ts
// 認証前に叩かれるAPIを素通りさせるための許可リストを明示。
// /api/auth/me と /api/settings/theme/active は 401/200 を返すためブロックしない。

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ALLOW = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/totp-begin',
  '/api/auth/totp-verify',
  '/api/auth/me',
  '/api/settings/theme/active',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/manifest.webmanifest',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 許可リスト: 前方一致
  if (ALLOW.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  // ここで特定パスを保護したい場合は追加実装
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/health).*)'], // 必要に応じて除外
};
