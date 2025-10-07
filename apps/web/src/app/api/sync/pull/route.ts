import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get('since');
  const where = since ? { updatedAt: { gt: new Date(since) } } : {};
  const [boxes, items] = await Promise.all([
    prisma.box.findMany({ where }),
    prisma.item.findMany({ where }),
  ]);

  const res = NextResponse.json({ boxes, items });
  res.headers.set('content-type', 'application/json; charset=utf-8'); // ★ 追加
  return res;
}
