import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { requireUserId } from "@/server/auth";

export async function GET(req: Request) {
  const uid = await requireUserId(req);
  const u = await prisma.user.findUnique({
    where: { id: uid },
    select: { userId: true, userName: true, totpEnabled: true, recoveryCodes: true }
  });
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const recoveryCount = Array.isArray(u.recoveryCodes) ? (u.recoveryCodes as string[]).length : 0;
  return NextResponse.json({ userId: u.userId, userName: u.userName, totpEnabled: u.totpEnabled, recoveryCount });
}
