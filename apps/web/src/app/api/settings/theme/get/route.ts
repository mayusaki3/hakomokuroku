import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

export async function GET(req: Request) {
  const uid = await requireUserId(req);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || '';
  const t = await prisma.theme.findFirst({
    where: { id, userId: uid },
  });
  if (!t) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ theme: t });
}
