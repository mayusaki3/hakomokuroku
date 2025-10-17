// apps/web/src/app/api/auth/login/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import argon2 from 'argon2'; 
import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function setLoginCookie(token: string) {
  const res = NextResponse.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    [
      `hk_token=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      // 本番 https 運用時は Secure を付ける: 'Secure'
    ].join('; ')
  );
  return res;
}

export async function POST(req: Request) {
  try {
    const { userId, password } = await req.json().catch(() => ({} as any));
    if (!userId || !password) return bad('userId と password は必須です', 400);

    // ユーザー取得
    const user = await prisma.user.findUnique({
      where: { userId },
      select: {
        id: true,
        isActive: true,
        passwordHash: true,
        totpEnabled: true,
        lockUntil: true,
      },
    });
    if (!user || !user.isActive) return bad('認証に失敗しました', 401);

    // ロック中判定
    if (user.lockUntil && user.lockUntil > new Date()) {
      return bad('アカウントが一時ロックされています', 423);
    }

    // パスワード検証
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return bad('認証に失敗しました', 401);

    // TOTP 必須なら LoginChallenge を発行して誘導
    if (user.totpEnabled) {
      const loginId = uuidv4();
      const now = new Date();
      await prisma.loginChallenge.create({
        data: {
          id: loginId,
          userId: user.id,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000), // 5分
          used: false,
        },
      });
      return NextResponse.json({ requireTotp: true, loginId }, { status: 200 });
    }

    // セッショントークン発行（SyncToken）
    const raw = randomBytes(32).toString('hex'); // Cookie に載せるプレーントークン
    const tokenHash = createHash('sha256').update(raw).digest('hex');

    const ua = req.headers.get('user-agent') ?? '';
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      // @ts-ignore
      (req as any).ip ||
      '';
    const deviceName = req.headers.get('x-hk-device') ?? null;

    const now = new Date();
    const ttlDays = Number(process.env.HK_TOKEN_TTL_DAYS ?? '30'); // 必要に応じて
    const expiresAt = new Date(now.getTime() + ttlDays * 86400000); // ★常にDateで渡す

    await prisma.syncToken.create({
      data: {
        userId: user.id,
        tokenHash,
        issuedAt: new Date(),
        expiresAt,
        userAgent: ua,
        ip,
        deviceName,
      },
    });

    // 最終ログイン更新（別要件で分けたい場合は削除可）
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Cookie セットして返す
    const res = setLoginCookie(raw);
    return res;
  } catch (e) {
    return bad('サーバーエラー', 500);
  }
}
