// apps/web/src/app/api/auth/totp/status/route.ts
export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const loginId = searchParams.get('loginId') || '';
  if (!loginId) return NextResponse.json({ error: 'loginId required' }, { status: 400 });

  const ch = await prisma.loginChallenge.findUnique({ where: { id: loginId } });
  if (!ch || ch.used || (ch.expiresAt && ch.expiresAt < new Date())) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const u = await prisma.user.findUnique({
    where: { id: ch.userId },
    select: { recoveryCodes: true },
  });
  const list = Array.isArray(u?.recoveryCodes) ? u!.recoveryCodes : [];
  return NextResponse.json({ recoveryRemain: list.length });
}
