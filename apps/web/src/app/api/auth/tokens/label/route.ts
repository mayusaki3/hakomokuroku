export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/auth/requireUserId';

/**
 * POST /api/auth/tokens/label
 * body: { token: string, label: string }
 *
 * - Content-Type 不正は 400
 * - JSONパース不正は 400
 * - token/label 未指定 or 非string は 400
 * - 未ログインは 401
 * - 対象トークンなしは 404
 * - DB例外は 500 相当
 */
export async function POST(req: Request) {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const token = body?.token;
  const label = body?.label;

  if (typeof token !== 'string' || token.trim().length === 0) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (typeof label !== 'string') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 401;
    return NextResponse.json({ error: 'unauthorized' }, { status });
  }

  try {
    const result = await prisma.syncToken.updateMany({
      where: { userId, tokenHash: token },
      data: { deviceName: label },
    });

    if (!result || typeof result.count !== 'number') {
      return new NextResponse(null, { status: 500 });
    }
    if (result.count === 0) {
      return new NextResponse(null, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return new NextResponse(null, { status: 500 });
  }
}
