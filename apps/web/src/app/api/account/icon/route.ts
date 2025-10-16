export const runtime = 'nodejs';
import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { prisma } from "@/server/prisma";
import sharp from "sharp";

export async function POST(req: Request) {
  const uid = await requireUserId(req);
  const ct = req.headers.get("content-type") || "";
  if (!ct.startsWith("image/") && !ct.startsWith("application/octet-stream"))
    return NextResponse.json({ error: "bad_type" }, { status: 400 });

  const buf = Buffer.from(await req.arrayBuffer());
  // サムネ規約：正方形 256px / JPEG 80%
  const out = await sharp(buf).resize(256, 256, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
  const dataUrl = `data:image/jpeg;base64,${out.toString("base64")}`;

  await prisma.user.update({ where: { id: uid }, data: { iconDataUrl: dataUrl } });

  // ヘッダに即反映してもらうためのイベントを返す
  return NextResponse.json({ ok: true, iconDataUrl: dataUrl });
}
