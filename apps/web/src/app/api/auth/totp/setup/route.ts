// apps/web/src/app/api/auth/totp/setup/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { requireUserId } from "@/server/auth";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { encryptStr } from "@/server/crypto";

export async function POST(req: Request) {
  try {
    const uid = await requireUserId(req);

    // TOTP_ENC_KEY チェック（未設定だと500になるのを回避）
    if (!process.env.TOTP_ENC_KEY) {
      return NextResponse.json({ error: "server_misconfig: TOTP_ENC_KEY" }, { status: 500 });
    }

    const user = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, userId: true } });
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 新しい候補シークレットを生成（検証完了まで本番鍵は触らない）
    const secret = authenticator.generateSecret(); // base32
    const otpauth = authenticator.keyuri(user.userId, "hakomokuroku", secret);
    const svg = await QRCode.toString(otpauth, { type: "svg", margin: 1 });

    // pending に保存
    const enc = await encryptStr(secret);
    await prisma.user.update({
      where: { id: uid },
      data: { totpPendingSecretEnc: enc }, // ← ここだけ更新
    });

    return NextResponse.json({ otpauth, svg });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
