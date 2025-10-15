import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { requireUserId } from "@/server/auth";
import { verifyPassword } from "@/server/auth";

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  const { password } = await req.json();

  const u = await prisma.user.findUnique({ where:{ id:userId } });
  if (!u) return NextResponse.json({ error:"unauthorized" }, { status:401 });

  const ok = await verifyPassword(u.passwordHash, String(password || ""));
  if (!ok) return NextResponse.json({ error:"invalid_password" }, { status:401 });

  await prisma.user.update({ where:{ id:userId }, data:{ totpEnabled:false, totpSecretEnc:null, recoveryCodes:null }});
  return new NextResponse(null, { status:204 });
}
