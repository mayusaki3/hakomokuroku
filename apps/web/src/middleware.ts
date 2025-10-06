import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_PREFIX = '/api/';
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith(API_PREFIX)) return NextResponse.next();

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const expected = process.env.SYNC_TOKEN || '';
  if (!token || token !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  return NextResponse.next();
}
export const config = { matcher: ['/api/:path*'] };
