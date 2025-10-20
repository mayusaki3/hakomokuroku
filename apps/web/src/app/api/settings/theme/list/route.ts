import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

export async function GET(req: Request) {
  const uid = await requireUserId(req);
  const themes = await prisma.theme.findMany({
    where: { userId: uid },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true },
  });
  return NextResponse.json({ themes });
}
