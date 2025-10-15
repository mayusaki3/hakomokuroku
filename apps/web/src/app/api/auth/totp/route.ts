import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { requireUserId } from "@/server/auth";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { encryptStr } from "@/server/crypto";

export async function POST(req: Request) {
  const userId = await requireUserId(req); // 既存: Authorization Bearer or dev token
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error:"unauthorized" }, { status:401 });

  const secret = authenticator.generateSecret(); // Base32
  const otpauth = authenticator.keyuri(user.userId, "hakomokuroku", secret);
  const svg = await QRCode.toString(otpauth, { type: "svg", margin: 1 });

  // 仮シークレットを暗号化で保存（検証成功まで enabled にしない）
  const encSecret = await encryptStr(secret);
  await prisma.user.update({ where:{ id:userId }, data:{ totpSecretEnc: encSecret }});

  return NextResponse.json({ otpauth, svg });
}
