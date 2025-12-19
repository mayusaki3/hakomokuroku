// apps/web/src/app/api/auth/totp/status/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';

/**
 * GET /api/auth/totp/status?challengeId=...
 *
 * - challengeId 必須（LoginChallenge.id）
 * - not found / used / expired は 404
 * - 正常は 200: { ok:true, recoveryRemain:number }
 * - DB例外は 500（ボディなし）
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const challengeId = searchParams.get('challengeId') ?? '';

  if (!challengeId) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  try {
    const ch = await prisma.loginChallenge.findUnique({ where: { id: challengeId } });
    if (!ch || ch.used || (ch.expiresAt && ch.expiresAt < new Date())) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    const u = await prisma.user.findUnique({
      where: { id: ch.userId },
      select: { recoveryCodes: true },
    });

    const list = Array.isArray(u?.recoveryCodes) ? (u!.recoveryCodes as any[]) : [];
    return NextResponse.json({ ok: true, recoveryRemain: list.length }, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
