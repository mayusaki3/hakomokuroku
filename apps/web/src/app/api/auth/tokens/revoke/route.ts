// apps/web/src/app/api/auth/tokens/revoke/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { requireUserId } from "@/server/auth";

export async function POST(req: Request) {
  const uid = await requireUserId(req);

  // CSRF 簡易対策：JSON 必須
  if (!/application\/json/i.test(req.headers.get('content-type') || '')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const token = await prisma.syncToken.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  // 存在しない or 他人のトークン → 404（権限の有無を匂わせない）
  if (!token || token.userId !== uid) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await prisma.syncToken.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
