export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { verifyPassword } from '@/server/password';
import { createSession, revokeSession, SESSION_COOKIE, sessionCookieOptions } from '@/server/auth';

export async function POST(req: Request): Promise<Response> {
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (typeof input.userId !== 'string' || !input.userId.trim() ||
      typeof input.password !== 'string' || !input.password) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { userId: input.userId.trim() } });
    if (!user || !user.isActive || (user.lockUntil && user.lockUntil > new Date()) ||
        !(await verifyPassword(user.passwordHash, input.password))) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    if (user.totpEnabled) {
      const challenge = await prisma.loginChallenge.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      });
      return NextResponse.json({ ok: true, mfaRequired: true, challengeId: challenge.id });
    }

    const previous = req.headers.get('cookie')?.split(';').map(v => v.trim())
      .find(v => v.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
    const { token } = await createSession(user.id);
    await revokeSession(previous);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const response = NextResponse.json({ ok: true, mfaRequired: false });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error('POST /api/auth/login failed', error);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
