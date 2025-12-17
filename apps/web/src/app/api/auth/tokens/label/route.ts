// apps/web/src/app/api/auth/tokens/label/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/auth/requireUserId';

function isJsonContentType(req: Request): boolean {
  const ct = req.headers.get('content-type');
  return typeof ct === 'string' && ct.toLowerCase().startsWith('application/json');
}

function toStatus(err: unknown, fallback: number): number {
  const e = err as any;
  const s = e?.status ?? e?.statusCode;
  if (typeof s === 'number') return s;
  const msg = typeof e?.message === 'string' ? e.message : '';
  if (msg.toUpperCase().includes('UNAUTHORIZED')) return 401;
  return fallback;
}

type Body = {
  token?: unknown;
  label?: unknown;
};

export async function POST(req: Request) {
  try {
    if (!isJsonContentType(req)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      // JSON パース不正は「例外を投げず」400 で返す（テスト期待）
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const token = body?.token;
    const label = body?.label;

    if (typeof token !== 'string' || token.trim() === '') {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    if (typeof label !== 'string') {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      return NextResponse.json({ error: 'unauthorized' }, { status: toStatus(e, 401) });
    }

    const updated = await prisma.syncToken.updateMany({
      where: { userId, token },
      data: { label },
    });

    if (!updated || typeof updated.count !== 'number') {
      // Prisma の戻りが想定外なら 500 扱い
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    if (updated.count === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error('[tokens/label] failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
