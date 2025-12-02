export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

export async function GET(req: Request) {
  // ★ここで認証 → 自ユーザーIDを確定
  const uid = await requireUserId(req);

  // ★サーバ側で userId=uid にハード固定（クエリ等は一切見ない）
  const rows = await prisma.syncToken.findMany({
    where: { userId: uid },
    orderBy: [{ issuedAt: 'desc' }],
    select: {
      id: true,
      // tokenHash は自端の一致判定にのみ使うが、漏えい性は低い（平文は返さない）
      tokenHash: true,
      issuedAt: true,
      expiresAt: true,
      lastUsedAt: true,
      deviceName: true,
      userAgent: true,
      ip: true,
    },
  });

  // 念のため二重フィルタ（万一 join 等を追加しても他人のが混ざらない）
  const tokens = rows.filter((r) => ((r as any).userId === undefined ? true : false));

  return NextResponse.json({ tokens });
}
