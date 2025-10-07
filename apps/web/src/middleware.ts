import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const expected = process.env.SYNC_TOKEN || '';
  if (!expected || token === expected) return NextResponse.next();
  return new NextResponse('Unauthorized', { status: 401 });
}
export const config = { matcher: ['/api/sync/:path*'] };
