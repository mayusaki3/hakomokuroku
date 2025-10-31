import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';

// 既定テーマ（必要に応じて既存名に合わせる）
const DEFAULT_THEME = { name: 'default', dark: false };

async function resolveUser(req: NextRequest): Promise<{ id: string } | null> {
  const host = req.headers.get('host') ?? 'localhost:3000';
  const proto = (req.headers.get('x-forwarded-proto') || 'http').replace(/[^a-z]/gi, '');
  const meUrl = `${proto}://${host}/api/settings/user`;
  try {
    const r = await fetch(meUrl, {
      headers: { cookie: req.headers.get('cookie') ?? '' , accept: 'application/json' },
      cache: 'no-store',
      credentials: 'include',
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null as any);
    return j?.user?.id ? { id: j.user.id } : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await resolveUser(req);

    // 未ログインでも 200 + 既定テーマ
    if (!user) {
      return NextResponse.json({ ok: true, theme: DEFAULT_THEME }, { status: 200 });
    }

    // ログイン時は DB のユーザ設定を参照（なければ既定）
    const setting = await prisma.userSetting.findUnique({
      where: { userId: user.id },
      select: { activeThemeName: true, dark: true },
    });

    const theme = setting
      ? { name: setting.activeThemeName ?? DEFAULT_THEME.name, dark: !!setting.dark }
      : DEFAULT_THEME;

    return NextResponse.json({ ok: true, theme }, { status: 200 });
  } catch (e) {
    console.error('GET /api/settings/theme/active failed:', e);
    // 失敗でも 200 + 既定（UI を止めない）
    return NextResponse.json({ ok: true, theme: DEFAULT_THEME }, { status: 200 });
  }
}
