import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';

function checkAuth(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!process.env.SYNC_TOKEN || token !== process.env.SYNC_TOKEN) {
    return false;
  }
  return true;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor'); // ISO or null
  const whereBox   = cursor ? { updatedAt: { gt: new Date(cursor) } } : {};
  const whereItem  = cursor ? { updatedAt: { gt: new Date(cursor) } } : {};
  const whereLoc   = cursor ? { updatedAt: { gt: new Date(cursor) } } : {};

  const [items, boxes, locations] = await Promise.all([
    prisma.item.findMany({ where: whereItem }),
    prisma.box.findMany({ where: whereBox }),
    prisma.boxLocation.findMany({ where: whereLoc }),
  ]);

  // DB全体の最新updatedAtからカーソルを生成（時刻ズレ影響なし）
  const [iMax, bMax, lMax] = await Promise.all([
    prisma.item.aggregate({ _max: { updatedAt: true } }),
    prisma.box.aggregate({ _max: { updatedAt: true } }),
    prisma.boxLocation.aggregate({ _max: { updatedAt: true } }),
  ]);
  const maxDate = [iMax._max.updatedAt, bMax._max.updatedAt, lMax._max.updatedAt]
    .filter(Boolean)
    .sort((a, b) => (a!.getTime() - b!.getTime())) // asc
    .at(-1) || new Date();
  const nextCursor = maxDate.toISOString();

  return NextResponse.json({ boxes, items, locations, cursor: nextCursor });
}
