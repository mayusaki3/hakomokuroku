import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { hashPassword } from "@/server/auth";

export async function POST(req: Request) {
  try {
    const { userId, password, userName } = await req.json();
    if (!userId || !password) return NextResponse.json({ error: "bad_request" }, { status: 400 });

    const exists = await prisma.user.findUnique({ where: { userId } });
    if (exists) return NextResponse.json({ error: "user_exists" }, { status: 409 });

    const passwordHash = await hashPassword(password);
    const u = await prisma.user.create({
      data: { userId, userName: userName ?? null, passwordHash, isActive: true },
      select: { id: true, userId: true, userName: true },
    });

    return NextResponse.json({ ok: true, user: u }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
