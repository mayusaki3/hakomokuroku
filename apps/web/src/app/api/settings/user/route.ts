import { NextResponse } from 'next/server';
import { readSession } from '@/server/auth'; // ← requireUserId は使わない（readSession は既に動作実績あり）
import { prisma } from '@/lib/prisma'; // ← prisma は lib から輸入
export const runtime = 'nodejs';

const headersNoStore = { 'Cache-Control': 'no-store' };

// /api/settings/user
export async function GET() {
  try {
    // まずセッションだけで判定（未ログイン・セッション切れは user:null を返す）
    const { user } = await readSession();
    if (!user) {
      // 未ログインは 401
      return NextResponse.json(
        { ok: false, user: null },
        { status: 401, headers: headersNoStore }
      );
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
      // セッションはあるが DB に有効ユーザーがいないケース → 404
      return NextResponse.json(
        { ok: false, user: null },
        { status: 404, headers: headersNoStore }
      );
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
      { headers: headersNoStore }
    );
  } catch (err) {
    console.error('GET /api/settings/user failed', err);
    // DB 例外などは 500 系
    return NextResponse.json(
      { ok: false, user: null },
      { status: 500, headers: headersNoStore }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const { user } = await readSession();
    if (!user) {
      // 未ログイン
      return NextResponse.json(
        { ok: false, user: null },
        { status: 401, headers: headersNoStore }
      );
    }

    const body = await req.json().catch(() => null) as { displayName?: unknown } | null;
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';

    if (!displayName) {
      // displayName 不正
      return NextResponse.json(
        { ok: false, message: 'displayName is required' },
        { status: 400, headers: headersNoStore }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { userName: displayName },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: headersNoStore }
    );
  } catch (err) {
    console.error('PUT /api/settings/user failed', err);
    return NextResponse.json(
      { ok: false },
      { status: 500, headers: headersNoStore }
    );
  }
}
