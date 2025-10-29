// ログインAPI：成功時に Cookie "st" を発行
// ・Cookie値は「生トークン（URLセーフ）」
// ・DBには sha256(hex) でハッシュ保存
// ・Cloudflaredトンネル配下は Secure+SameSite=None、localhostは Lax で運用

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomUrlSafe, sha256hex } from '@/server/crypto';
import { getClientIp } from '@/server/ip'; // 既に作成済み想定
import { verifyPassword } from '@/server/password'; // 既存のパスワード検証関数を想定（なければ差し替え）

const COOKIE_NAME = 'st';

// Cookie属性をURL/ヘッダから決定（cloudflared経由: https）
function cookieAttrsFor(req: Request): Parameters<NextResponse['cookies']['set']>[2] {
  const url = new URL(req.url);
  // proxy配下で X-Forwarded-Proto を尊重（本番/トンネルで https 判定）
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const isHttps = (forwardedProto ?? url.protocol.replace(':', '')) === 'https';

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30日
  };
}

export async function POST(req: Request) {
  try {
    const { userId, password, deviceName } = await req.json();

    // 1) ユーザー取得
    const u = await prisma.user.findFirst({
      where: { userId, isActive: true },
      select: { id: true, passwordHash: true, lockUntil: true },
    });
    if (!u) {
      return NextResponse.json({ ok: false, reason: 'invalid-credential' }, { status: 401 });
    }
    if (u.lockUntil && u.lockUntil > new Date()) {
      return NextResponse.json({ ok: false, reason: 'locked' }, { status: 401 });
    }

    // 2) パスワード検証（argon2idなど）
    const ok = await verifyPassword(password, u.passwordHash);
    if (!ok) {
      return NextResponse.json({ ok: false, reason: 'invalid-credential' }, { status: 401 });
    }

    // 3) 生トークン生成 → hexでハッシュ化しDB保存
    const raw = randomUrlSafe(32); // Cookieに入れる値
    const tokenHash = sha256hex(raw); // DB保存値

    const now = new Date();
    const exp = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const ua = req.headers.get('user-agent') ?? undefined;
    const ip = getClientIp(req) ?? undefined;

    await prisma.syncToken.create({
      data: {
        userId: u.id,
        tokenHash,
        issuedAt: now,
        expiresAt: exp,
        deviceName: deviceName ?? undefined,
        userAgent: ua,
        ip,
      },
    });

    // 4) Cookie発行
    const res = NextResponse.json({ ok: true }, { status: 200 });

    console.log('[login] set-cookie sent', res.headers.get('set-cookie'));

    res.cookies.set(COOKIE_NAME, raw, cookieAttrsFor(req));

    console.log('[login] about to set cookie', {
      cookieName: 'st',
      // 実トークンは漏らさない
      tokenPreview: token?.slice(0, 8),
      expiresAt,
      ua: req.headers.get('user-agent'),
      ip: getClientIp(req) // 既存 util
    });

    return res;
  } catch (e) {
    // 想定外は 500
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}
