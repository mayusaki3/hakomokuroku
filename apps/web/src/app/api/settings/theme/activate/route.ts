import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';          // 既存の Prisma クライアントに合わせる
import { getUser } from '@/server/auth';           // 既存の認証取得に合わせる

export async function POST(req: Request) {
  const me = await getUser();                      // 未ログインなら null を返す想定
  if (!me) return new NextResponse('unauthorized', { status: 401 });

  const { id, vars } = await req.json().catch(() => ({}));
  // id: string | '' | null, vars: Record<string,string> | null | undefined

  await prisma.themeActive.upsert({
    where: { userId: me.id },
    update: { themeId: id || null, vars: vars ?? null },
    create: { userId: me.id, themeId: id || null, vars: vars ?? null },
  });

  return NextResponse.json({ ok: true });
}
