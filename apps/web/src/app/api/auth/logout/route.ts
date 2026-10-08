export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revokeSession, SESSION_COOKIE, sessionCookieOptions } from '@/server/auth';

export async function POST() {
  try {
    await revokeSession(cookies().get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  } catch (error) {
    console.error('POST /api/auth/logout failed', error);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
