// apps/web/src/app/api/auth/totp/setup/route.ts
import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import crypto from 'crypto';

import { getCurrentUser } from '@/server/auth';
import { prisma } from '@/server/prisma';

/**
 * 環境鍵（Base64, 32 bytes）を使用して TOTP pending secret を暗号化する。
 * - 失敗時は internal_error（500）として扱う（共通仕様に合わせる）
 */
const ENC_KEY_B64 = process.env.TOTP_SECRET_KEY ?? '';

function getKey(): Buffer {
  if (!ENC_KEY_B64) throw new Error('TOTP_SECRET_KEY is not set');
  const key = Buffer.from(ENC_KEY_B64, 'base64');
  if (key.length !== 32) throw new Error('TOTP_SECRET_KEY must be 32 bytes (Base64)');
  return key;
}

function encryptWithEnvKey(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

export async function POST() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: me.id } });
    if (!user) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    // すでに有効 → 状態衝突（共通仕様の conflict）
    if (user.totpEnabled) {
      return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 });
    }

    const pendingSecret = authenticator.generateSecret();
    const pendingEnc = encryptWithEnvKey(pendingSecret);

    await prisma.user.update({
      where: { id: me.id },
      data: {
        totpPendingSecretEnc: pendingEnc,
        totpPendingAt: new Date(),
        totpFailCount: 0,
      },
    });

    const issuer = 'Hakomokuroku';
    const labelUserId = user.userId ?? 'user';
    const label = `${issuer}: ${labelUserId}`;
    const otpauthUrl = authenticator.keyuri(label, issuer, pendingSecret);

    return NextResponse.json({ ok: true, otpauthUrl }, { status: 200 });
  } catch {
    // 共通仕様：内部エラーは ok:false + internal_error
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
