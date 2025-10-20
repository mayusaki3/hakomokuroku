import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

type SaveBody = {
  id?: string;
  name: string;
  vars?: Record<string, string>;
  wallpaperThumb?: string | null; // data:image/*;base64,...
};

export async function POST(req: Request) {
  const uid = await requireUserId(req);
  const body = (await req.json()) as SaveBody;

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }
  const data = {
    userId: uid,
    name: body.name.trim(),
    vars: body.vars ?? {},
    wallpaperThumb: body.wallpaperThumb ?? null,
  };

  const theme = body.id
    ? await prisma.theme.update({
        where: { id: body.id },
        data,
      })
    : await prisma.theme.create({ data });

  return NextResponse.json({ ok: true, id: theme.id });
}
