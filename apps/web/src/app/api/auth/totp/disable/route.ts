import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/server/auth';
import { verifyTotpCode, verifyRecoveryCode } from '@/server/totp';

export async function POST(req: Request) {
  // 認証
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e: any) {
    // requireUserId が 401 相当を投げた場合は 401 を返す
    if (e && (e.status === 401 || e.message === 'UNAUTHORIZED')) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    throw e; // それ以外は既定エラーに委ねる
  }

  // Content-Type チェック
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return NextResponse.json(
      { ok: false, error: 'bad_request' },
      { status: 400 }
    );
  }

  // JSON パース
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'bad_request' },
      { status: 400 }
    );
  }

  const { code, recoveryCode } = body ?? {};

  const hasCode = typeof code === 'string' && code.length > 0;
  const hasRecovery = typeof recoveryCode === 'string' && recoveryCode.trim().length > 0;

  // 入力検証
  if (!hasCode && !hasRecovery) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  if (hasCode && !/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  // ユーザー取得
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.totpEnabled) {
    return NextResponse.json(
      { ok: false, error: 'conflict' },
      { status: 409 }
    );
  }

  // ロックチェック
  if (user.lockUntil && user.lockUntil > new Date()) {
    return NextResponse.json(
      { ok: false, error: 'too_many_requests' },
      { status: 429 }
    );
  }

  // 検証（※ verify 実装は既存関数に委譲する想定）
  const verified =
    code
      ? await verifyTotpCode(user, code)
      : await verifyRecoveryCode(user, recoveryCode.trim());

  if (!verified) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  // 無効化
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: false,
        totpSecretEnc: null,
        recoveryCodes: null,
        totpFailCount: 0,
      },
    });
  } catch (e) {
    console.error('[totp/disable] update failed', e);
    // 500 相当（ボディは固定しない方針でもOK）
    return new NextResponse(null, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
