export const runtime = 'nodejs';

import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import { prisma } from '@/server/prisma';
import { waitForMfaRaceTestBarrier } from '@/server/mfa-race-test-barrier';
import { decryptStr } from '@/server/crypto';
import { isMfaLoginLocked } from '@/server/mfa-login-attempt';
import { SESSION_COOKIE, sessionCookieOptions, sessionTokenHash, revokeSession } from '@/server/auth';
import { attachLoginDevice, DEVICE_COOKIE, deviceCookieOptions } from '@/server/device-login';

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
    if (!challenge || challenge.expiresAt <= new Date()) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user || !user.isActive || !user.totpEnabled || !user.totpSecretEnc ||
        (user.lockUntil && user.lockUntil > new Date())) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    if (await isMfaLoginLocked(user.id)) {
      return NextResponse.json({ ok: false, error: 'too_many_attempts' }, { status: 429 });
    }

    // Diagnostic barrier: both servers have passed challenge/user/lock checks.
    // No effect unless the isolated test process sets its secret and directory.
    const recoveryHash = typeof input.recoveryCode === 'string'
      ? createHash('sha256').update(input.recoveryCode.trim()).digest('hex')
      : null;
    const admission = await prisma.mfaAuthEvent.create({
      data: { userId: user.id, challengeId: challenge.id, kind: 'ADMISSION',
        codeHash: recoveryHash },
    });
    await waitForMfaRaceTestBarrier(req, challenge.id);

    // An already-used challenge may carry a recovery-code replay. Record its
    // admission and evaluate it against the committed redemption order.
    // For TOTP-only requests retain the existing not_found response.
    if (challenge.used && !recoveryHash) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
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
      if (!challenge.used && recoveryHash && Array.isArray(user.recoveryCodes) && user.recoveryCodes.includes(recoveryHash)) {
        valid = true;
        consumedRecoveryHash = recoveryHash;
      }
    }
    if (challenge.used) valid = false;
    if (!valid) {
      const locked = await prisma.$transaction(async tx => {
        if (recoveryHash) {
          const redeemed = await tx.mfaRecoveryRedemption.findUnique({
            where: { userId_codeHash: { userId: user.id, codeHash: recoveryHash } },
          });
          if (redeemed && admission.id < redeemed.eventId) return false;
        }
        await tx.mfaLoginAttempt.upsert({
          where: { userId: user.id }, create: { userId: user.id, failCount: 0 },
          update: {},
        });
        const current = await tx.mfaLoginAttempt.findUniqueOrThrow({ where: { userId: user.id } });
        const now = new Date();
        if (current.lockedUntil && current.lockedUntil > now) return true;
        const nextCount = (current.lockedUntil ? 0 : current.failCount) + 1;
        const lockedUntil = nextCount >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null;
        await tx.mfaLoginAttempt.update({
          where: { userId: user.id }, data: { failCount: nextCount, lockedUntil },
        });
        await tx.mfaAuthEvent.create({
          data: { userId: user.id, challengeId: challenge.id, kind: 'FAILURE',
            codeHash: recoveryHash, admissionId: admission.id },
        });
        return lockedUntil !== null;
      });
      return locked
        ? NextResponse.json({ ok: false, error: 'too_many_attempts' }, { status: 429 })
        : NextResponse.json({ ok: false, error: 'auth_failed' }, { status: 400 });
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    let sessionId: string;
    try {
      sessionId = await prisma.$transaction(async tx => {
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
        const attempt = await tx.mfaLoginAttempt.findUnique({ where: { userId: user.id } });
        if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) throw new Error('MFA_LOCKED');
        if (consumedRecoveryHash) {
          const event = await tx.mfaAuthEvent.create({
            data: { userId: user.id, challengeId: challenge.id, kind: 'REDEMPTION',
              codeHash: consumedRecoveryHash, admissionId: admission.id },
          });
          await tx.mfaRecoveryRedemption.create({
            data: { userId: user.id, codeHash: consumedRecoveryHash,
              admissionId: admission.id, eventId: event.id },
          });
        }
        const session = await tx.authSession.create({
          data: { userId: user.id, tokenHash: sessionTokenHash(token), expiresAt },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await tx.mfaLoginAttempt.updateMany({
          where: { userId: user.id },
          data: { failCount: 0, lockedUntil: null },
        });
        await tx.mfaAuthEvent.create({
          data: { userId: user.id, challengeId: challenge.id, kind: 'SUCCESS',
            codeHash: consumedRecoveryHash, admissionId: admission.id },
        });
        return session.id;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'MFA_LOCKED') {
        return NextResponse.json({ ok: false, error: 'too_many_attempts' }, { status: 429 });
      }
      if (error instanceof Error &&
          (error.message === 'CHALLENGE_CONSUMED' || error.message === 'RECOVERY_CONSUMED')) {
        return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
      }
      throw error;
    }

    let deviceCookie: string;
    try {
      deviceCookie = await attachLoginDevice(user.id, sessionId, req);
    } catch (error) {
      await revokeSession(token);
      throw error;
    }
    const previous = req.headers.get('cookie')?.split(';').map(v => v.trim())
      .find(v => v.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
    await revokeSession(previous);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    response.cookies.set(DEVICE_COOKIE, deviceCookie, deviceCookieOptions());
    return response;
  } catch (error) {
    console.error('POST /api/auth/login/totp failed', error);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
