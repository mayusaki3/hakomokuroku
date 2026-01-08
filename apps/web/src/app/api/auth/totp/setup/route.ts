// apps/web/src/app/api/auth/totp/setup/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { getCurrentUser } from '@/server/auth';
import crypto from 'crypto';
import { authenticator } from 'otplib';

// ------------------------------
// TOTP 設定（±1スライス許容）
// ------------------------------
authenticator.options = { window: 1 };

// ------------------------------
// 暗号化（TOTP_PENDING_SECRET 用）
// ※ テストで env を切り替えられるよう、key は毎回読む
// ------------------------------
function getKey(): Buffer {
  const b64 = process.env.TOTP_SECRET_KEY;
  if (!b64) throw new Error('TOTP_SECRET_KEY is missing');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 32) throw new Error('TOTP_SECRET_KEY must be 32 bytes (base64)');
  return buf;
}

function encryptWithEnvKey(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // iv(12) + tag(16) + enc
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

// ------------------------------
// POST /api/auth/totp/setup
// ------------------------------
export async function POST() {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: me.id } });
    if (!user) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

    if (user.totpEnabled) {
      return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 });
    }

    // secret生成 → pendingへ保存
    const secret = authenticator.generateSecret();
    const pendingEnc = encryptWithEnvKey(secret);

    await prisma.user.update({
      where: { id: user.id },
      data: { totpPendingSecretEnc: pendingEnc },
    });

    // otpauth URL（issuer/label はプロジェクト側の規約に合わせて調整）
    const issuer = 'HakoMokuroku';
    const label = `user:${user.id}`;
    const otpauthUrl = authenticator.keyuri(label, issuer, secret);

    return NextResponse.json({ ok: true, otpauthUrl }, { status: 200 });
  } catch (e) {
    // 鍵未設定等もここに落とす（共通仕様）
    console.error('[totp/setup] error', e);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
