// apps/web/src/app/api/auth/totp/verify/route.ts
import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import crypto from 'crypto';

import { getCurrentUser, issueRecoveryCodes } from '@/server/auth';
import { prisma } from '@/server/prisma';

// 形式は 6 桁数字（文字列）に限定する
function isSixDigits(v: unknown): v is string {
  return typeof v === 'string' && /^\d{6}$/.test(v);
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

export async function POST(req: Request) {
  try {
    // Content-Type 必須
    const ct = String(req.headers.get('content-type'));
    if (!ct.includes('application/json')) {
      return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
    }

    // JSON 不正は invalid_request
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
    }

    const code = body?.code;
    if (!isSixDigits(code)) {
      return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
    }

    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: me.id } });
    if (!user) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    // 既に有効 → conflict
    if (user.totpEnabled) {
      return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 });
    }

    // setup 未実行 → conflict
    if (!user.totpPendingSecretEnc) {
      return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 });
    }

    // pending secret を復号（環境鍵が無ければ例外→internal_error）
    const keyB64 = process.env.TOTP_SECRET_KEY ?? '';
    if (!keyB64) throw new Error('TOTP_SECRET_KEY is not set');

    const key = Buffer.from(keyB64, 'base64');
    if (key.length !== 32) throw new Error('TOTP_SECRET_KEY must be 32 bytes (Base64)');

    const buf = Buffer.from(String(user.totpPendingSecretEnc), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const secret = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');

    const ok = authenticator.check(code, secret);
    if (!ok) {
      // 認証失敗は auth_failed（共通仕様）
      await prisma.user.update({
        where: { id: me.id },
        data: { totpFailCount: { increment: 1 } },
      });
      return NextResponse.json({ ok: false, error: 'auth_failed' }, { status: 400 });
    }

    // 成功時：TOTP 有効化 + recovery codes 発行
    const { recoveryCodesPlain, recoveryCodesHashed } = issueRecoveryCodes();

    await prisma.user.update({
      where: { id: me.id },
      data: {
        totpEnabled: true,
        totpSecretEnc: user.totpPendingSecretEnc,
        totpPendingSecretEnc: null,
        totpPendingAt: null,
        totpFailCount: 0,
        recoveryCodes: recoveryCodesHashed,
      },
    });

    return NextResponse.json(
      { ok: true, recoveryCodes: recoveryCodesPlain },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
