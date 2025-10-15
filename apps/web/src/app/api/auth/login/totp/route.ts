export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { getLoginChallenge, markLoginChallengeUsed, issueSyncToken } from "@/server/auth";
import { decryptStr } from "@/server/crypto";
import { authenticator } from "otplib";
import crypto from "crypto";

// 安定化：±1スライス許容
authenticator.options = { window: 1 };

// 簡易レート制限（ユーザー×IPあたり 5分で5回）
const attempts = new Map<string, number[]>();
const rateKey = (userId: string, ip: string) => `${userId}:${ip}`;
const clientIp = (req: Request) => (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local");
function pushAttempt(userId: string, ip: string) {
  const now = Date.now();
  const key = rateKey(userId, ip);
  const win = 5 * 60 * 1000;
  const arr = (attempts.get(key) || []).filter((t) => now - t < win);
  arr.push(now);
  attempts.set(key, arr);
  return arr.length;
}

// 入力正規化
const norm6 = (v: unknown) =>
  String(v ?? "")
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\D/g, "")
    .slice(0, 6);

export async function POST(req: Request) {
  try {
    const { loginId, code, recoveryCode } = await req.json();
    if (!loginId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

    // 失効/使用済みでないチャレンジのみ許可（ここでは消費しない）
    const c = await getLoginChallenge(loginId);
    if (!c) return NextResponse.json({ error: "expired" }, { status: 400 });

    const u = await prisma.user.findUnique({ where: { id: c.userId } });
    if (!u?.totpEnabled || !u.totpSecretEnc) return NextResponse.json({ error: "not_enabled" }, { status: 400 });

    // レート制限
    const count = pushAttempt(u.id, clientIp(req));
    if (count > 5) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

    let ok = false;

    // 6桁コード検証
    const six = norm6(code);
    if (six && /^\d{6}$/.test(six)) {
      const secret = await decryptStr(u.totpSecretEnc);
      ok = authenticator.check(six, secret);
    }

    // 回復コード検証（未成功時のみ）
    if (!ok && recoveryCode) {
      const rc = String(recoveryCode).trim();
      const h = crypto.createHash("sha256").update(rc).digest("hex");
      const list: string[] = (u.recoveryCodes as any) ?? [];
      const idx = list.findIndex((x) => x === h);
      if (idx >= 0) {
        ok = true;
        const next = [...list];
        next.splice(idx, 1);
        await prisma.user.update({ where: { id: u.id }, data: { recoveryCodes: next } });
      }
    }

    if (!ok) return NextResponse.json({ error: "invalid" }, { status: 400 });

    // 成功時のみチャレンジを消費
    await markLoginChallengeUsed(loginId);

    // ログイン完了：トークン発行 & 最終ログイン更新
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
