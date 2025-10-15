import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { getLoginChallenge, markLoginChallengeUsed, issueSyncToken } from "@/server/auth";
import { decryptStr } from "@/server/crypto";
import { authenticator } from "otplib";
import crypto from "crypto";

// あると安定：±1スライス許容
authenticator.options = { window: 1 };

const norm6 = (v:any)=>String(v??'').replace(/[０-９]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0xFEE0)).replace(/\D/g,'').slice(0,6);
const norm8 = (v:any)=>String(v??'').trim();

export async function POST(req: Request) {
  const { loginId, code, recoveryCode } = await req.json();
  if (!loginId) return NextResponse.json({ error:"bad_request" }, { status:400 });

  const c = await getLoginChallenge(loginId);
  if (!c) return NextResponse.json({ error:"expired" }, { status:400 });

  const u = await prisma.user.findUnique({ where:{ id: c.userId } });
  if (!u?.totpEnabled || !u.totpSecretEnc) return NextResponse.json({ error:"not_enabled" }, { status:400 });

  let ok = false;

  const six = norm6(code);
  if (six && /^\d{6}$/.test(six)) {
    const secret = await decryptStr(u.totpSecretEnc);
    ok = authenticator.check(six, secret);
  }

  if (!ok && recoveryCode) {
    const h = crypto.createHash("sha256").update(norm8(recoveryCode)).digest("hex");
    const list: string[] = (u.recoveryCodes as any) ?? [];
    const idx = list.findIndex(x => x === h);
    if (idx >= 0) {
      ok = true;
      const next = [...list]; next.splice(idx,1);
      await prisma.user.update({ where:{ id:u.id }, data:{ recoveryCodes: next }});
    }
  }

  if (!ok) return NextResponse.json({ error:"invalid" }, { status:400 });

  // ★成功時のみ消費
  await markLoginChallengeUsed(loginId);

  const { token, expiresAt } = await issueSyncToken(u.id);
  const res = NextResponse.json({ token, expiresAt });
  res.headers.append("Set-Cookie", `hk_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${90*24*3600}`);
  return res;
}
