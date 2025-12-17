export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/auth/requireUserId';

/**
 * GET /api/auth/tokens
 * - Content-Type が application/json でない場合は 400（テスト仕様に合わせる）
 * - 未ログインは 401
 * - DB例外は 500 相当
 */
export async function GET(req: Request) {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e: any) {
    // テスト側は throw { status: 401 } などで来る想定
    const status = typeof e?.status === 'number' ? e.status : 401;
    return NextResponse.json({ error: 'unauthorized' }, { status });
  }

  try {
    const rows = await prisma.syncToken.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      select: {
        tokenHash: true,
        issuedAt: true,
        expiresAt: true,
        lastUsedAt: true,
        deviceName: true,
        userAgent: true,
        ip: true,
      },
    });

    return NextResponse.json(rows, { status: 200 });
  } catch (e) {
    return new NextResponse(null, { status: 500 });
  }
}
