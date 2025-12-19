// apps/web/src/app/api/auth/totp/verify/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { getCurrentUser } from '@/server/auth';
import { verifyTotpPendingCode, generateRecoveryCodes } from '@/server/totp';

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const ct = req.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: me.id } });
    if (!user) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

    if (user.totpEnabled) {
      return NextResponse.json({ ok: false, error: 'already_enabled' }, { status: 400 });
    }

    if (!user.totpPendingSecretEnc) {
      return NextResponse.json({ ok: false, error: 'setup_not_started' }, { status: 400 });
    }

    let code: string | undefined;
    try {
      const body = await req.json();
      code = typeof body?.code === 'string' ? body.code.trim() : undefined;
    } catch {
      return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    }
    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: me.id } });
    if (!user) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

    if (!user.totpPendingSecretEnc) {
      return NextResponse.json({ ok: false, error: 'setup_not_started' }, { status: 400 });
    }

    const ok = await verifyTotpPendingCode(user, code);
    if (!ok) {
      await prisma.user.update({
        where: { id: me.id },
        data: { totpFailCount: (user.totpFailCount ?? 0) + 1 },
      });
      return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
    }

    const recoveryCodes = generateRecoveryCodes(10);

    await prisma.user.update({
      where: { id: me.id },
      data: {
        totpEnabled: true,
        totpSecretEnc: user.totpPendingSecretEnc,
        totpPendingSecretEnc: null,
        totpPendingAt: null,
        totpFailCount: 0,
        recoveryCodes,
      },
    });

    return NextResponse.json({ ok: true, recoveryCodes }, { status: 200 });
  } catch (e) {
    return new NextResponse(null, { status: 500 });
  }
}
