// apps/web/src/app/api/auth/tokens/revokeAll/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

export async function POST(req: Request) {
  const uid = await requireUserId(req);

  if (!/application\/json/i.test(req.headers.get('content-type') || '')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  await prisma.syncToken.deleteMany({ where: { userId: uid } });
  return new NextResponse(null, { status: 204 });
}
