import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const token = process.env.SYNC_TOKEN ?? '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== token) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { boxes = [], items = [], locations = [] } = await req.json();

    await prisma.$transaction(async (tx) => {
      // 1) Box を先に
      for (const b of boxes) {
        await tx.box.upsert({
          where: { id: b.id },
          update: {
            code: b.code, name: b.name, location: b.location ?? null,
            tags: b.tags ?? [], thumbs: b.thumbs ?? [],
            updatedAt: new Date(b.updatedAt),
          },
          create: {
            id: b.id, code: b.code, name: b.name, location: b.location ?? null,
            tags: b.tags ?? [], thumbs: b.thumbs ?? [],
            createdAt: new Date(b.createdAt), updatedAt: new Date(b.updatedAt),
          },
        });
      }

      // 2) Item
      for (const it of items) {
        const boxExists = await tx.box.findUnique({ where: { id: it.boxId } });
        if (!boxExists) {
          await tx.box.upsert({
            where: { id: it.boxId },
            update: {},
            create: {
              id: it.boxId,
              code: it.boxId,          // 最低限埋める
              name: '',                // 必須なら空文字
              location: null,
              tags: [],
              thumbs: [],
              createdAt: new Date(it.createdAt ?? new Date().toISOString()),
              updatedAt: new Date(it.updatedAt ?? new Date().toISOString()),
            },
          });
        }
        await tx.item.upsert({
          where: { id: it.id },
          update: {
            boxId: it.boxId, name: it.name, tags: it.tags ?? [],
            note: it.note ?? null, thumbs: it.thumbs ?? [],
            updatedAt: new Date(it.updatedAt),
          },
          create: {
            id: it.id, boxId: it.boxId, name: it.name, tags: it.tags ?? [],
            note: it.note ?? null, thumbs: it.thumbs ?? [],
            createdAt: new Date(it.createdAt), updatedAt: new Date(it.updatedAt),
          },
        });
      }

      // 3) BoxLocation
      for (const l of locations) {
        await tx.boxLocation.upsert({
          where: { boxId: l.boxId },              // ← ここを id ではなく boxId に
          update: {
            thumbs: l.thumbs ?? [],
            note: l.note ?? null,
            updatedAt: new Date(l.updatedAt ?? nowIso),
          },
          create: {
            id: l.id ?? crypto.randomUUID(),
            boxId: l.boxId,
            thumbs: l.thumbs ?? [],
            note: l.note ?? null,
            createdAt: new Date(l.createdAt ?? nowIso),
            updatedAt: new Date(l.updatedAt ?? nowIso),
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      boxes: boxes.length,
      items: items.length,
      locations: locations.length,
    });
  } catch (e: any) {
    console.error('[sync/push] error:', e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
