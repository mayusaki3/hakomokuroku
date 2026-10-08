export const runtime = 'nodejs';

import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import { prisma } from '@/server/prisma';
import { decryptStr } from '@/server/crypto';
import { SESSION_COOKIE, sessionCookieOptions, sessionTokenHash, revokeSession } from '@/server/auth';

export async function POST(req: Request) {
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (typeof input.challengeId !== 'string' || !input.challengeId ||
      (typeof input.code !== 'string' && typeof input.recoveryCode !== 'string')) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  try {
    const challenge = await prisma.loginChallenge.findUnique({ where: { id: input.challengeId } });
    if (!challenge || challenge.used || challenge.expiresAt <= new Date()) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user || !user.isActive || !user.totpEnabled || !user.totpSecretEnc ||
        (user.lockUntil && user.lockUntil > new Date())) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    let valid = false;
    let consumedRecoveryHash: string | null = null;
    if (typeof input.code === 'string') {
      const normalized = input.code.replace(/[０-９]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
      if (/^\d{6}$/.test(normalized)) {
        valid = authenticator.check(normalized, await decryptStr(user.totpSecretEnc));
      }
    }
    if (!valid && typeof input.recoveryCode === 'string') {
      const hash = createHash('sha256').update(input.recoveryCode.trim()).digest('hex');
      if (Array.isArray(user.recoveryCodes) && user.recoveryCodes.includes(hash)) {
        valid = true;
        consumedRecoveryHash = hash;
      }
    }
    if (!valid) {
      return NextResponse.json({ ok: false, error: 'auth_failed' }, { status: 400 });
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    try {
      await prisma.$transaction(async tx => {
        const claimed = await tx.loginChallenge.updateMany({
          where: { id: challenge.id, used: false, expiresAt: { gt: new Date() } },
          data: { used: true },
        });
        if (claimed.count !== 1) throw new Error('CHALLENGE_CONSUMED');

        if (consumedRecoveryHash) {
          // SQLite serializes writes. Re-read inside transaction to avoid stale recovery lists.
          const fresh = await tx.user.findUnique({ where: { id: user.id } });
          const codes = fresh?.recoveryCodes;
          if (!Array.isArray(codes) || !codes.includes(consumedRecoveryHash)) {
            throw new Error('RECOVERY_CONSUMED');
          }
          await tx.user.update({
            where: { id: user.id },
            data: { recoveryCodes: codes.filter(code => code !== consumedRecoveryHash) },
          });
        }
        await tx.authSession.create({
          data: { userId: user.id, tokenHash: sessionTokenHash(token), expiresAt },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date(), totpFailCount: 0 },
        });
      });
    } catch (error) {
      if (error instanceof Error &&
          (error.message === 'CHALLENGE_CONSUMED' || error.message === 'RECOVERY_CONSUMED')) {
        return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
      }
      throw error;
    }

    const previous = req.headers.get('cookie')?.split(';').map(v => v.trim())
      .find(v => v.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
    await revokeSession(previous);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error('POST /api/auth/login/totp failed', error);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
