// apps/web/src/app/api/settings/theme/active/route.ts
// テーマの有効設定を返す。未ログインなら 401。
// 既存コードが getUser(...) を要求していた問題に合わせ、auth.ts の getUser(=requireUserId) を使用。

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser as requireUserId } from '@/server/auth';

export async function GET() {
  try {
    const userId = await requireUserId(); // 401相当はcatchで401返却
    const setting = await prisma.userSetting.findUnique({
      where: { userId },
      select: { visionProvider: true, uiVars: true },
    });

    // 任意: ThemeActive/Theme も読む場合は適宜追加
    return NextResponse.json({ ok: true, setting }, { status: 200 });
  } catch (e) {
    // 未認証など
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
