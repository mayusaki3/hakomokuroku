export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

import { cookies } from 'next/headers';

export async function GET(req: Request) {

  const c = cookies();
  const st = c.get('st')?.value;
  console.log('[me] cookie st length', st?.length, 'present?', !!st);

  // DB照合直前にも追加
  console.log('[me] will lookup tokenHash', st ? 'yes' : 'no');

  // …既存の tokenHash = sha256hex(st) → SELECT …
  // 検索結果の有無を必ず出力
  console.log('[me] prisma syncToken found?', !!row, row?.userId);
  // …


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
