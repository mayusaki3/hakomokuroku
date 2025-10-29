import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

export async function GET() {
  const me = await requireUserId();
  if (!me) return new NextResponse('unauthorized', { status: 401 });

  const rec = await prisma.themeActive.findUnique({ where: { userId: me.id } });
  // デフォルト：id=''、vars={}
  return NextResponse.json({
    id: rec?.themeId ?? '',
    vars: (rec?.vars as Record<string, string> | undefined) ?? {},
  });
}
