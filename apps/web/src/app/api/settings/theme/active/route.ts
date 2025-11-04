// apps/web/src/app/api/settings/theme/active/route.ts
// 現在有効なテーマ（1件）を返す。未ログイン・取得失敗時も 200 で既定テーマを返す。

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser as requireUserId } from '@/server/auth';

// 未ログイン・取得失敗時に返す既定テーマ
const DEFAULT_THEME = {
  id: 'default',
  scheme: 'system',    // 必要なければ削除可
  vars: {} as Record<string, string>,
};

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await requireUserId().catch(() => null);
    if (!userId) {
      // 未ログイン：200 + 既定テーマ
      return NextResponse.json(
        { ok: true, theme: DEFAULT_THEME },
        { status: 200, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      );
    }

    // 現在の有効テーマを取得（ThemeActive が一次情報）
    const active = await prisma.themeActive.findUnique({
      where: { userId },
      select: { themeId: true, vars: true },
    });

    let themeId = active?.themeId ?? 'default';
    let vars = active?.vars ?? {};

    // vars が空で themeId がある場合は、Theme 側の定義を補完
    if ((!active?.vars || Object.keys(vars).length === 0) && active?.themeId) {
      const base = await prisma.theme.findUnique({
        where: { id: active.themeId },
        select: { vars: true },
      });
      if (base?.vars) vars = base.vars as Record<string, string>;
    }

    return NextResponse.json(
      { ok: true, theme: { id: themeId, vars } },
      { status: 200, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (e) {
    // 失敗時も 200 + 既定テーマ（止血）
    return NextResponse.json(
      { ok: true, theme: DEFAULT_THEME },
      { status: 200, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  }
}
