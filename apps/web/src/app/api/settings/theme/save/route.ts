import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { getCurrentUser } from '@/server/auth';

// The editor uses vars/wallpaperThumb; Prisma stores tokens/wallpaper.
type SaveBody = {
  id?: string;
  name?: string;
  vars?: Record<string, string>;
  wallpaperThumb?: string | null;
};

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }
  const data = {
    name: body.name.trim(),
    tokens: body.vars ?? {},
    wallpaper: body.wallpaperThumb == null ? undefined : { thumbDataUrl: body.wallpaperThumb },
  };

  if (body.id) {
    const result = await prisma.theme.updateMany({
      where: { id: body.id, userId: user.id },
      data,
    });
    if (result.count === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, id: body.id });
  }

  const theme = await prisma.theme.create({
    data: { userId: user.id, baseTheme: 'system', ...data },
  });
  return NextResponse.json({ ok: true, id: theme.id });
}
