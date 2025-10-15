// apps/web/src/app/api/auth/totp/verify/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { requireUserId } from "@/server/auth";
import { authenticator } from "otplib";
import { decryptStr } from "@/server/crypto";
import crypto from "crypto";

function normalizeCode(input: unknown): string {
  const s = String(input ?? '');
  // 全角数字→半角、数字以外除去
  const z2h = s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  return z2h.replace(/\D/g, '').slice(0, 6);
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId(req);
    const body = await req.json();
    const code = normalizeCode(body.code);
    if (!code || !/^\d{6}$/.test(String(code))) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totpEnabled: true, totpSecretEnc: true, totpPendingSecretEnc: true }
    });
    if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!u.totpPendingSecretEnc) return NextResponse.json({ error: "no_pending_secret" }, { status: 400 });

    // pending シークレットで検証
    const secret = await decryptStr(u.totpPendingSecretEnc);
    const ok = authenticator.check(String(code), secret);
    if (!ok) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

    // 回復コード（8桁×10）を生成（平文を返し、DB にはハッシュで保存）
    const recoveryPlain = Array.from({ length: 10 }, () =>
      crypto.randomUUID().replace(/-/g, "").slice(0, 8)
    );
    const recoveryHash = recoveryPlain.map(rc =>
      crypto.createHash("sha256").update(rc).digest("hex")
    );

    // 本番へ昇格：enabled, secretEnc ← pending、pending は消去
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: true,
        totpSecretEnc: u.totpPendingSecretEnc,
        totpPendingSecretEnc: null,
        recoveryCodes: recoveryHash,
      },
    });

    // 一度だけ平文を返す
    return NextResponse.json({ enabled: true, recoveryCodes: recoveryPlain });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
