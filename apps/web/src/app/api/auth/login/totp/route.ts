// apps/web/src/app/api/auth/login/totp/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import {
  getLoginChallenge,
  markLoginChallengeUsed,
  issueSyncToken,
} from '@/server/auth';
import { decryptStr } from '@/server/crypto';
import { authenticator } from 'otplib';
import crypto from 'crypto';

// ------------------------------
// TOTP 設定
// ------------------------------

// 安定化：±1スライス許容
authenticator.options = { window: 1 };

// ------------------------------
// 簡易レート制限（ユーザー×IPあたり 5分で5回）
// ------------------------------

const attempts = new Map<string, number[]>();
const rateKey = (userId: string, ip: string) => `${userId}:${ip}`;

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';

function pushAttempt(userId: string, ip: string) {
  const now = Date.now();
  const key = rateKey(userId, ip);
  const win = 5 * 60 * 1000; // 5分
  const arr = (attempts.get(key) || []).filter((t) => now - t < win);
  arr.push(now);
  attempts.set(key, arr);
  return arr.length;
}

// ------------------------------
// 入力正規化（全角→半角、数字6桁）
// ------------------------------

const norm6 = (v: unknown) =>
  String(v ?? '')
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/\D/g, '')
    .slice(0, 6);

// ------------------------------
// POST /api/auth/login/totp
// ------------------------------

export async function POST(req: Request) {
  try {
    // (2) Content-Type 必須
    const ct = req.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      return NextResponse.json(
        { ok: false, error: 'bad_request' },
        { status: 400 },
      );
    }

    // (3) JSON パース不正は 400
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'bad_request' },
        { status: 400 },
      );
    }

    // (1) challengeId のみを受け取る
    const { challengeId, code, recoveryCode } = body ?? {};
    if (!challengeId) {
      return NextResponse.json(
        { ok: false, error: 'bad_request' },
        { status: 400 },
      );
    }

    // 失効/使用済みでないチャレンジのみ許可（ここでは消費しない）
    const ch = await getLoginChallenge(challengeId);
    if (!ch) {
      return NextResponse.json(
        { ok: false, error: 'expired' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: ch.userId },
    });

    if (!user?.totpEnabled || !user.totpSecretEnc) {
      return NextResponse.json(
        { ok: false, error: 'not_enabled' },
        { status: 400 },
      );
    }

    // レート制限
    const count = pushAttempt(user.id, clientIp(req));
    if (count > 5) {
      return NextResponse.json(
        { ok: false, error: 'too_many_attempts' },
        { status: 429 },
      );
    }

    let ok = false;

    // ---- 6桁 TOTP コード検証 ----
    const six = norm6(code);
    if (six && /^\d{6}$/.test(six)) {
      const secret = await decryptStr(user.totpSecretEnc);
      ok = authenticator.check(six, secret);
    }

    // ---- リカバリコード検証（未成功時のみ）----
    if (!ok && recoveryCode) {
      const rc = String(recoveryCode).trim();
      const h = crypto.createHash('sha256').update(rc).digest('hex');
      const list: string[] = (user.recoveryCodes as any) ?? [];
      const idx = list.findIndex((x) => x === h);
      if (idx >= 0) {
        ok = true;
        const next = [...list];
        next.splice(idx, 1);
        await prisma.user.update({
          where: { id: user.id },
          data: { recoveryCodes: next },
        });
      }
    }

    if (!ok) {
      return NextResponse.json(
        { ok: false, error: 'invalid' },
        { status: 400 },
      );
    }

    // 成功時のみチャレンジを消費
    await markLoginChallengeUsed(challengeId);

    // ログイン完了：トークン発行 & 最終ログイン更新
    const { token, expiresAt } = await issueSyncToken(user.id, {
      userAgent: req.headers.get('user-agent') || undefined,
      ip: clientIp(req),
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const res = NextResponse.json(
      { ok: true, token, expiresAt },
      { status: 200 },
    );

    // Cookie 付与（既存仕様踏襲）
    res.headers.append(
      'Set-Cookie',
      `hk_token=${encodeURIComponent(
        token,
      )}; Path=/; SameSite=Lax; Max-Age=${90 * 24 * 3600}`,
    );

    return res;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'server_error' },
      { status: 500 },
    );
  }
}
