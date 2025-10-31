// ユーザー名と「現在のセッション」デバイス名を更新する。
// body: { userName?: string, deviceName?: string }
import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sha256hex } from '@/server/crypto';
import { readSession } from '@/server/auth';

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userName, deviceName } = body ?? {};

    const raw = cookies().get('st')?.value;
    if (!raw) return NextResponse.json({ ok: false }, { status: 401 });
    const tokenHash = sha256hex(raw);
    const session = await readSession(tokenHash);
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    // ユーザー名の更新（任意項目）
    if (typeof userName === 'string') {
      await prisma.user.update({
        where: { id: session.userId },
        data: { userName },
      });
    }

    // このセッションの deviceName を更新（他デバイスには影響しない）
    if (typeof deviceName === 'string') {
      await prisma.syncToken.update({
        where: { id: session.id },
        data: { deviceName },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
