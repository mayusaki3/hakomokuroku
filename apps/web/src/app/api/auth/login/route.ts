export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { verifyPassword, issueSyncToken, createLoginChallenge } from "@/server/auth";

export async function POST(req: Request) {
  try {
    const { userId, password } = await req.json();
    if (!userId || !password) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const u = await prisma.user.findUnique({ where: { userId } });
    if (!u || !u.isActive) {
      return NextResponse.json({ error: "invalid" }, { status: 401 });
    }

    const ok = await verifyPassword(u.passwordHash, password);
    if (!ok) {
      return NextResponse.json({ error: "invalid" }, { status: 401 });
    }

    // TOTP 有効なら 2段階へ
    if (u.totpEnabled) {
      const loginId = await createLoginChallenge(u.id);
      return NextResponse.json({ need_totp: true, loginId });
    }

    // 直接ログイン完了：トークン発行 & 最終ログイン更新
    const { token, expiresAt } = await issueSyncToken(u.id, {
      userAgent: req.headers.get('user-agent') || undefined,
      ip: (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'local',
    });
    await prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });

    const res = NextResponse.json({ token, expiresAt });
    res.headers.append(
      "Set-Cookie",
      `hk_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${90 * 24 * 3600}`
    );
    return res;
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
