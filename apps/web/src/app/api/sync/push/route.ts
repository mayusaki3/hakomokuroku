import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';
import type { Prisma } from '@prisma/client';

const arr = (v: any) => (Array.isArray(v) ? (v as Prisma.JsonArray) : ([] as Prisma.JsonArray));

export async function POST(req: Request) {
  try {
    const userId = await requireUserId(req);
    const { boxes = [], items = [], locations = [] } = await req.json();

    // Box → Item → BoxLocation の順に upsert
    for (const b of boxes) {
      await prisma.box.upsert({
        where: { id: b.id },
        update: {
          code: b.code,
          name: b.name,
          location: b.location ?? null,
          tags: arr(b.tags),
          thumbs: arr(b.thumbs),
          meta: b.meta ?? {},
          aiState: b.aiState ?? null,
          aiUpdatedAt: b.aiUpdatedAt ?? null,
          userId,
        },
        create: {
          id: b.id,
          code: b.code,
          name: b.name,
          location: b.location ?? null,
          tags: arr(b.tags),
          thumbs: arr(b.thumbs),
          meta: b.meta ?? {},
          aiState: b.aiState ?? null,
          aiUpdatedAt: b.aiUpdatedAt ?? null,
          userId,
        },
      });
    }

    for (const it of items) {
      await prisma.item.upsert({
        where: { id: it.id },
        update: {
          boxId: it.boxId,
          name: it.name,
          tags: arr(it.tags),
          thumbs: arr(it.thumbs),
          note: it.note ?? null,
          meta: it.meta ?? {},
          aiState: it.aiState ?? null,
          aiUpdatedAt: it.aiUpdatedAt ?? null,
          userId,
        },
        create: {
          id: it.id,
          boxId: it.boxId,
          name: it.name,
          tags: arr(it.tags),
          thumbs: arr(it.thumbs),
          note: it.note ?? null,
          meta: it.meta ?? {},
          aiState: it.aiState ?? null,
          aiUpdatedAt: it.aiUpdatedAt ?? null,
          userId,
        },
      });
    }

    for (const l of locations) {
      await prisma.boxLocation.upsert({
        where: { id: l.id },
        update: {
          boxId: l.boxId,
          thumbs: arr(l.thumbs),
          note: l.note ?? null,
          meta: l.meta ?? {},
          aiState: l.aiState ?? null,
          aiUpdatedAt: l.aiUpdatedAt ?? null,
          userId,
        },
        create: {
          id: l.id,
          boxId: l.boxId,
          thumbs: arr(l.thumbs),
          note: l.note ?? null,
          meta: l.meta ?? {},
          aiState: l.aiState ?? null,
          aiUpdatedAt: l.aiUpdatedAt ?? null,
          userId,
        },
      });
    }

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response('Server Error', { status: 500 });
  }
}
