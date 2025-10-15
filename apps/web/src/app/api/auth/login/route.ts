import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { verifyPassword, issueSyncToken, createLoginChallenge } from "@/server/auth";

export async function POST(req: Request) {
  try {
    const { userId, password } = await req.json();
    if (!userId || !password) return NextResponse.json({ error: "bad_request" }, { status: 400 });

    const u = await prisma.user.findUnique({ where: { userId } });
    if (!u || !u.isActive) return NextResponse.json({ error: "invalid" }, { status: 401 });

    const ok = await verifyPassword(u.passwordHash, password);
    if (!ok) return NextResponse.json({ error: "invalid" }, { status: 401 });

    // TOTP 有効なら 2段階へ
    if (u.totpEnabled) {
      const loginId = await createLoginChallenge(u.id);
      return NextResponse.json({ need_totp: true, loginId });
    }

    // 直接トークン発行
    const { token, expiresAt } = await issueSyncToken(u.id);
    const res = NextResponse.json({ token, expiresAt });

    // UIミドルウェア通過用のCookieも返す（TokenMirrorがあっても害なし）
    res.headers.append(
      "Set-Cookie",
      `hk_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${90 * 24 * 3600}`
    );
    return res;
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
