import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

/**
 * PUT /api/user/icon
 * body: { dataURL: string }  // PNG dataURL 前提
 * 成功: 200 + { ok:true, me }
 * 未ログイン: 401
 * バリデーションNG: 400
 */
export async function PUT(req: Request) {
  try {
    const userId = await requireUserId().catch(() => null);
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { dataURL } = await req.json().catch(() => ({}));
    if (typeof dataURL !== 'string' || !dataURL.startsWith('data:image/png;base64,')) {
      return NextResponse.json({ ok: false, error: 'INVALID_DATAURL' }, { status: 400 });
    }

    // 保存（存在しないと Prisma は throw する）
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { iconDataUrl: dataURL },
      select: { id: true, displayName: true, iconDataUrl: true },
    });

    return NextResponse.json({ ok: true, me: updated }, { status: 200 });
  } catch (err) {
    // Prisma の「レコードなし」は 404 相当に寄せる（テストしやすい）
    const msg = (err as Error)?.message ?? String(err);
    const status = /No record was found/.test(msg) ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
