// ユーザー名と現在のセッションに紐づくデバイス名を更新する。
// body: { userName?: string, deviceName?: string }
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { readAuthenticatedSession } from '@/server/auth';

export async function PUT(req: NextRequest) {
  try {
    const session = await readAuthenticatedSession();
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { userName, deviceName } = body ?? {};
    if (typeof userName === 'string') {
      await prisma.user.update({
        where: { id: session.userId },
        data: { userName },
      });
    }
    if (typeof deviceName === 'string') {
      const current = await prisma.authSession.findUnique({
        where: { id: session.id },
        select: { deviceId: true },
      });
      if (current?.deviceId) {
        await prisma.device.updateMany({
          where: { userId: session.userId, deviceId: current.deviceId },
          data: { name: deviceName },
        });
      } else {
        return NextResponse.json({ ok: false, error: 'device_not_associated' }, { status: 409 });
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
