export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth';
import { prisma } from '@/server/prisma';

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId(req);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const devices = await prisma.device.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      select: { deviceId: true, name: true, activePrefix: true, createdAt: true, lastUsedAt: true },
    });
    return NextResponse.json({ devices }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
