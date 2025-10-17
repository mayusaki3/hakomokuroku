export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

export async function GET(req: Request) {
  const uid = await requireUserId(req).catch(() => null);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const u = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      userId: true,
      userName: true,
      iconDataUrl: true,
      totpEnabled: true,
      recoveryCodes: true,
    },
  });
  if (!u) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    userId: u.userId,
    userName: u.userName ?? null,
    iconDataUrl: u.iconDataUrl ?? null,
    totpEnabled: u.totpEnabled,
    recoveryCount: Array.isArray(u.recoveryCodes) ? u.recoveryCodes.length : 0,
  });
}
