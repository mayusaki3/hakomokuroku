import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';

export const runtime = 'nodejs';

const norm = <T extends Record<string, any>>(x: T) => ({
  ...x,
  thumbs: Array.isArray(x.thumbs) ? x.thumbs : [],
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get('since');
  const where = since ? { updatedAt: { gt: new Date(since) } } : {};

  const [boxes, items, locations] = await Promise.all([
    prisma.box.findMany({ where }),
    prisma.item.findMany({ where }),
    prisma.boxLocation.findMany({ where }),
  ]);

  const res = NextResponse.json({
    boxes: boxes.map(norm),
    items: items.map(norm),
    locations: locations.map(norm),
  });
  res.headers.set('content-type', 'application/json; charset=utf-8');
  return res;
}
