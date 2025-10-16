export const runtime = 'nodejs';
import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { requireUserId, extractPlainTokenHash } from "@/server/auth";

export async function POST(req: Request) {
  const uid = await requireUserId(req);
  const tokenHash = await extractPlainTokenHash(req);
  if (tokenHash) await prisma.syncToken.deleteMany({ where: { tokenHash, userId: uid } });
  return new NextResponse(null, { status: 204 });
}
