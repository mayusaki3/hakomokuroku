import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { getCurrentUser } from '@/server/auth';

// 既定テーマ（必要に応じて既存名に合わせる）
const DEFAULT_THEME = { name: 'default', dark: false };

export async function GET() {
  try {
    const user = await getCurrentUser();

    // 未ログインでも 200 + 既定テーマ
    if (!user) {
      return NextResponse.json({ ok: true, theme: DEFAULT_THEME }, { status: 200 });
    }

    // ログイン時は DB のユーザ設定を参照（なければ既定）
    const setting = await prisma.userSetting.findUnique({
      where: { userId: user.id },
      select: { activeTheme: true },
    });

    const theme = setting
      ? { name: setting.activeTheme, dark: setting.activeTheme === 'builtin:dark' }
      : DEFAULT_THEME;

    return NextResponse.json({ ok: true, theme }, { status: 200 });
  } catch (e) {
    console.error('GET /api/settings/theme/active failed:', e);
    // 失敗でも 200 + 既定（UI を止めない）
    return NextResponse.json({ ok: true, theme: DEFAULT_THEME }, { status: 200 });
  }
}
