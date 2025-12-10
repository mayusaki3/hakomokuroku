// apps/web/src/app/api/auth/login/route.ts
// ログインAPI: ユーザ認証 → SyncToken発行 → HttpOnly Cookie(Secure; SameSite=None) 返却
// Cloudflareトンネル配下で動作するCookie属性を強制。

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  verifyPassword,
  hashPassword,
  randomUrlSafe,
  sha256hex,
  buildSessionSetCookie,
  getRequestUA,
  getRequestIP,
  SESSION_COOKIE_NAME,
} from '@/server/auth'; // すべてauth.ts経由
// ↑ verifyPassword/hashPassword は '@/server/password' から auth.ts が再出力

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = (body.userId ?? '').toString().trim();
    const password = (body.password ?? '').toString();

    if (!userId || !password) {
      return NextResponse.json({ ok: false, reason: 'INVALID_INPUT' }, { status: 400 });
    }

    // ユーザ検索（最低限の項目）
    const user = await prisma.user.findFirst({
      where: { userId, isActive: true },
      select: { id: true, passwordHash: true, totpEnabled: true, lockUntil: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // パスワード検証
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      // 失敗カウント等は必要に応じて
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // TOTP 有効なら、ここではセッションを「仮発行」にしても良いが
    // 既存フローに合わせて通常セッションを発行し、別画面でTOTP検証へ誘導する運用にも対応
    const token = randomUrlSafe(32);
    const tokenHash = sha256hex(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30); // 30d

    await prisma.syncToken.create({
      data: {
        userId: user.id,
        tokenHash,
        issuedAt: now,
        expiresAt,
        userAgent: getRequestUA(),
        ip: getRequestIP(),
      },
    });

    // Cookie生成（Domainは付与しない。Secure + SameSite=None は必須）
    const cookie = buildSessionSetCookie(token, expiresAt);
    const res = NextResponse.json({ ok: true, totpRequired: !!user.totpEnabled }, { status: 200 });
    res.headers.set('Set-Cookie', cookie); // 1つだけ
    // デバッグ用ログ（tokenは伏せる）
    console.log('[login] Set-Cookie', cookie.replace(/st=[^;]+/, 'st=***'));
    return res;
  } catch (e) {
    console.error('[login] error', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
