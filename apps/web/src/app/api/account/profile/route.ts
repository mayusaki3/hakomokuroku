export const runtime = 'nodejs';
import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { requireUserId } from "@/server/auth";

export async function PATCH(req: Request) {
  const uid = await requireUserId(req);
  const body = await req.json().catch(() => ({}));
  let name = typeof body.userName === 'string' ? body.userName.trim() : undefined;
  if (!name) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (name.length > 50) name = name.slice(0, 50);

  await prisma.user.update({ where: { id: uid }, data: { userName: name } });
  return NextResponse.json({ ok: true, userName: name });
}
