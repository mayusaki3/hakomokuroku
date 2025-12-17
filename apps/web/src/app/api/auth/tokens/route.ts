// apps/web/src/app/api/auth/tokens/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/auth/requireUserId';

function isJsonContentType(req: Request): boolean {
  const ct = req.headers.get('content-type');
  return typeof ct === 'string' && ct.toLowerCase().startsWith('application/json');
}

function toStatus(err: unknown, fallback: number): number {
  // 既存コード側の投げ方（e.status / e.code / message）に寄せて吸収
  const e = err as any;
  const s = e?.status ?? e?.statusCode;
  if (typeof s === 'number') return s;
  const msg = typeof e?.message === 'string' ? e.message : '';
  if (msg.toUpperCase().includes('UNAUTHORIZED')) return 401;
  return fallback;
}

export async function GET(req: Request) {
  try {
    if (!isJsonContentType(req)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      return NextResponse.json({ error: 'unauthorized' }, { status: toStatus(e, 401) });
    }

    const list = await prisma.syncToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        token: true,
        label: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(list, { status: 200 });
  } catch (e) {
    console.error('[tokens] failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
