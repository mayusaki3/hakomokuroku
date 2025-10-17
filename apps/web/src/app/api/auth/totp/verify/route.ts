// apps/web/src/app/api/auth/totp/verify/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { createHash, randomBytes } from 'crypto';
import { authenticator } from 'otplib';       // 既に使っている想定
import { decryptStr } from '@/server/crypto'; // 既存の暗号ユーティリティ
// import { rateLimit } ...  // 余裕があれば

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function cookie(token: string) {
  const res = NextResponse.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    [
      `hk_token=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      // 本番は Secure も
    ].join('; ')
  );
  return res;
}

export async function POST(req: Request) {
  const { loginId, code, recovery } = await req.json().catch(() => ({} as any));
  if (!loginId) return bad('loginId が必要です');

  // チャレンジ取得
  const ch = await prisma.loginChallenge.findUnique({ where: { id: loginId } });
  if (!ch || ch.used || (ch.expiresAt && ch.expiresAt < new Date())) {
    return bad('チャレンジが無効です', 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: ch.userId },
    select: {
      id: true,
      totpEnabled: true,
      totpSecretEnc: true,
      recoveryCodes: true,
      isActive: true,
    },
  });
  if (!user || !user.isActive || !user.totpEnabled) {
    return bad('ユーザーが無効です', 401);
  }

  let ok = false;
  // 1) 6桁 TOTP
  if (!ok && code) {
    const secret = user.totpSecretEnc ? await decryptStr(user.totpSecretEnc) : '';
    if (!secret) return bad('設定が無効です', 401);
    ok = authenticator.check(String(code).trim(), secret);
  }

  // 2) 回復コード
  let newRecovery: string[] | undefined = undefined;
  if (!ok && recovery) {
    const list = Array.isArray(user.recoveryCodes) ? [...user.recoveryCodes] : [];
    const idx = list.findIndex((v) => v === String(recovery).trim());
    if (idx >= 0) {
      ok = true;
      list.splice(idx, 1); // 使った分を消費
      newRecovery = list;
    }
  }

  if (!ok) return bad('認証に失敗しました', 401);

  // チャレンジ使用済みに
  await prisma.loginChallenge.update({
    where: { id: ch.id },
    data: { used: true },
  });

  // セッショントークン発行
  const raw = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  const ua = req.headers.get('user-agent') ?? '';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '';

  const now = new Date();
  const ttlDays = Number(process.env.HK_TOKEN_TTL_DAYS ?? '30'); // 30日
  const expiresAt = new Date(now.getTime() + ttlDays * 86400000);

  await prisma.$transaction([
    prisma.syncToken.create({
      data: { userId: user.id, tokenHash, issuedAt: now, expiresAt, userAgent: ua, ip },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(newRecovery ? { recoveryCodes: newRecovery } : {}) },
    }),
  ]);

  return cookie(raw);
}
