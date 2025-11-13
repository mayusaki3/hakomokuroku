import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { getUser } from '@/server/auth';

/**
 * GET /api/settings/theme/active
 * 未ログイン: 200 + 既定 { themeId: 'default' }
 * ログイン済: DB のアクティブテーマ（なければ既定）
 */
export async function GET() {
  try {
    const { user } = await getUser();
    if (!user) {
      return NextResponse.json({ ok: true, active: { themeId: 'default' } }, { status: 200 });
    }
    const active = await prisma.themeActive.findUnique({
      where: { userId: user.id },
      select: { themeId: true },
    });
    return NextResponse.json(
      { ok: true, active: active ?? { themeId: 'default' } },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
