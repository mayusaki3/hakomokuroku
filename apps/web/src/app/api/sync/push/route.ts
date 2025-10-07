// apps/web/src/app/api/sync/push/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { syncPushZ } from '../types';

export const runtime = 'nodejs'; // ← Prisma は Edge で動かないので明示

const toDate = (s: string) => new Date(s);
const asArray = (x: any): any[] => (Array.isArray(x) ? x : []);
const asTags  = (x: any): any   => (Array.isArray(x) ? x : []);

export async function POST(req: Request) {
  try {
    // Content-Type/JSON パース
    const body = await req.json();

    // Zod で形を検証（ここで投げたら 400 を返す）
    const parsed = syncPushZ.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'ZodError', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { boxes = [], items = [], locations = [] } = parsed.data;

    // 1) Boxes（code 一意）
    for (const b of boxes) {
      const old = await prisma.box.findUnique({ where: { code: b.code } });
      const newer = !old || toDate(b.updatedAt) > old.updatedAt;
      if (!old) {
        await prisma.box.create({
          data: {
            id: b.id,
            code: b.code,
            name: b.name ?? '',
            location: b.location ?? null,
            tags: asTags(b.tags),
            thumbs: asArray(b.thumbs),
            createdAt: toDate(b.createdAt),
            updatedAt: toDate(b.updatedAt),
          },
        });
      } else if (newer) {
        await prisma.box.update({
          where: { code: b.code },
          data: {
            name: b.name ?? '',
            location: b.location ?? null,
            tags: asTags(b.tags),
            thumbs: asArray(b.thumbs),
            updatedAt: toDate(b.updatedAt),
          },
        });
      }
    }

    // 2) Items（id 一意）
    for (const it of items) {
      const old = await prisma.item.findUnique({ where: { id: it.id } });
      const newer = !old || toDate(it.updatedAt) > old.updatedAt;
      if (!old) {
        await prisma.item.create({
          data: {
            id: it.id,
            boxId: it.boxId,
            name: it.name ?? '',
            tags: asTags(it.tags),
            note: it.note ?? null,
            thumbs: asArray(it.thumbs),
            createdAt: toDate(it.createdAt),
            updatedAt: toDate(it.updatedAt),
          },
        });
      } else if (newer) {
        await prisma.item.update({
          where: { id: it.id },
          data: {
            boxId: it.boxId,
            name: it.name ?? '',
            tags: asTags(it.tags),
            note: it.note ?? null,
            thumbs: asArray(it.thumbs),
            updatedAt: toDate(it.updatedAt),
          },
        });
      }
    }

    // 3) Locations（boxId 一意）
    for (const loc of locations) {
      const old = await prisma.boxLocation.findUnique({ where: { boxId: loc.boxId } });
      const newer = !old || toDate(loc.updatedAt) > old.updatedAt;
      if (!old) {
        await prisma.boxLocation.create({
          data: {
            id: loc.id,
            boxId: loc.boxId,
            thumbs: asArray(loc.thumbs),
            note: loc.note ?? null,
            createdAt: toDate(loc.createdAt),
            updatedAt: toDate(loc.updatedAt),
          },
        });
      } else if (newer) {
        await prisma.boxLocation.update({
          where: { boxId: loc.boxId },
          data: {
            thumbs: asArray(loc.thumbs),
            note: loc.note ?? null,
            updatedAt: toDate(loc.updatedAt),
          },
        });
      }
    }

    const res = NextResponse.json({ ok: true });
    res.headers.set('content-type', 'application/json; charset=utf-8');
    return res;
  } catch (e: any) {
    // dev で原因が見えるように返す（本番はログだけにして 500 固定でもよい）
    console.error('sync/push error', e);
    return NextResponse.json(
      { error: String(e?.message ?? e), stack: e?.stack },
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
