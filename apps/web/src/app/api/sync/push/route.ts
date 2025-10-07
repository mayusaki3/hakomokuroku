import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { syncPushZ } from '../types';

function toDate(s: string) { return new Date(s); }
function asTags(x: any): any { return Array.isArray(x) ? x : []; }

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ログ出力（開発時のみ）
    console.log('PUSH body sample:', JSON.stringify({
      boxes: (body?.boxes ?? []).slice(0, 1),
      items: (body?.items ?? []).slice(0, 1),
    }, null, 2));

    const parsed = syncPushZ.parse(body); // 失敗すると throw
    const { boxes, items } = parsed;

    // 1) Box
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
            updatedAt: toDate(b.updatedAt),
          },
        });
      }
    }

    // 2) Item
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
            createdAt: toDate(it.createdAt),
            updatedAt: toDate(it.updatedAt),
          },
        });
      } else if (newer) {
        await prisma.item.update({
          where: { id: it.id },
          data: {
            name: it.name ?? '',
            tags: asTags(it.tags),
            note: it.note ?? null,
            boxId: it.boxId,
            updatedAt: toDate(it.updatedAt),
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('PUSH ERROR:', e);
    // ここでエラーメッセージを JSON で返す（暫定）
    return NextResponse.json(
      { error: String(e?.message ?? e), stack: e?.stack ?? null },
      { status: 500 },
    );
  }
}
