import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { syncPushZ } from '../types';
import { z } from 'zod';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = syncPushZ.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const { boxes, items } = parsed.data;

  // Box: code で upsert、updatedAt の新旧で競合解決
  for (const b of boxes) {
    const old = await prisma.box.findUnique({ where: { code: b.code } });
    const incomingNewer = !old || new Date(b.updatedAt) > old.updatedAt;
    if (!old) {
      await prisma.box.create({ data: { ...b, createdAt: new Date(b.createdAt), updatedAt: new Date(b.updatedAt) }});
    } else if (incomingNewer) {
      await prisma.box.update({ where: { code: b.code }, data: {
        name: b.name, location: b.location ?? null, tags: b.tags,
        updatedAt: new Date(b.updatedAt),
      }});
    }
  }

  // Item: id で upsert、updatedAt 比較
  for (const it of items) {
    const old = await prisma.item.findUnique({ where: { id: it.id } });
    const incomingNewer = !old || new Date(it.updatedAt) > old.updatedAt;
    if (!old) {
      await prisma.item.create({ data: { ...it, note: it.note ?? null, createdAt: new Date(it.createdAt), updatedAt: new Date(it.updatedAt) }});
    } else if (incomingNewer) {
      await prisma.item.update({ where: { id: it.id }, data: {
        name: it.name, tags: it.tags, note: it.note ?? null, boxId: it.boxId,
        updatedAt: new Date(it.updatedAt),
      }});
    }
  }

  return NextResponse.json({ ok: true });
}
