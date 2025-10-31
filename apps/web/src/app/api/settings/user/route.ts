import { NextResponse } from 'next/server';
import { readSession } from '@/server/auth';   // ← requireUserId は使わない（readSession は既に動作実績あり）
import { prisma } from '@/lib/prisma';         // ← prisma は lib から輸入
export const runtime = 'nodejs';

const headersNoStore = { 'Cache-Control': 'no-store' };

// /api/settings/user
export async function GET() {
  try {
    // まずセッションだけで判定（未ログイン・セッション切れは user:null を返す）
    const { user } = await readSession();
    if (!user) {
      return NextResponse.json({ ok: false, user: null }, { headers: headersNoStore });
    }

    // DB の最新を取得（isActive で無効化も除外）
    const u = await prisma.user.findFirst({
      where: { id: user.id, isActive: true },
      select: {
        id: true,
        userId: true,
        userName: true,
        iconDataUrl: true,
        totpEnabled: true,
      },
    });
    if (!u) {
      return NextResponse.json({ ok: false, user: null }, { headers: headersNoStore });
    }

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: u.id,
          userId: u.userId,
          userName: u.userName ?? null,
          iconDataUrl: u.iconDataUrl ?? null,
          totpEnabled: !!u.totpEnabled,
        },
      },
      { headers: headersNoStore },
    );
  } catch (err) {
    console.error('GET /api/settings/user failed', err);
    return NextResponse.json({ ok: false, user: null }, { headers: headersNoStore });
  }
}
