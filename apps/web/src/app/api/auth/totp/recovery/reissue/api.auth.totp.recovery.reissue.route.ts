// apps/web/src/app/api/auth/totp/recovery/reissue/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';
import { verifyTotpCode } from '@/server/totp';
import { sha256hex } from '@/server/crypto';

/**
 * リカバリコード再発行（POST /api/auth/totp/recovery/reissue）
 *
 * 仕様（要点）:
 * - Content-Type: application/json 必須
 * - Cookie sid によるログイン必須
 * - TOTP 有効（totpEnabled=true かつ totpSecretEncあり）必須
 * - code(6桁) をTOTPで検証し、成功時に recoveryCodes を10件再発行
 * - 旧 recoveryCodes は全失効（DB上の配列を置換）
 *
 * エラーコード体系（共通仕様に寄せる）:
 * - 400 invalid_request: Content-Type不正 / JSON不正 / code不正
 * - 400 auth_failed: TOTPコード検証失敗（詳細は秘匿）
 * - 401 unauthorized: 未ログイン
 * - 409 conflict: TOTP未有効 / 秘密鍵なし 等で実行不可
 * - 404 not_found: ログインユーザーが存在しない（原則想定外）
 * - 500 internal_error: 予期しない例外
 */

// recovery code（平文）生成：XXXX-XXXX（英大文字+数字）
function generatePlainRecoveryCodes(n: number): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 見分けづらい文字を除外
  const one = () => {
    const bytes = crypto.randomBytes(8);
    let s = '';
    for (let i = 0; i < 8; i++) {
      s += alphabet[bytes[i] % alphabet.length];
    }
    return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
  };

  const codes: string[] = [];
  for (let i = 0; i < n; i++) codes.push(one());
  return codes;
}

function isJsonContentType(req: Request): boolean {
  const ct = req.headers.get('content-type') ?? '';
  return /application\/json/i.test(ct);
}

function badRequest() {
  return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
}

export async function POST(req: Request) {
  // 1) Content-Type 必須
  if (!isJsonContentType(req)) {
    return badRequest();
  }

  // 2) 認証（Cookie sid）
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // 3) JSON parse + 入力検証
  let code: string | undefined;
  try {
    const body = await req.json();
    code = typeof body?.code === 'string' ? body.code.trim() : undefined;
  } catch {
    return badRequest();
  }

  if (!code || !/^\d{6}$/.test(code)) {
    return badRequest();
  }

  // 4) ユーザー取得 + 状態チェック
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        totpEnabled: true,
        totpSecretEnc: true,
        recoveryCodes: true,
        totpFailCount: true,
        lockUntil: true,
      },
    });

    if (!user) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    // TOTP 未有効 / 秘密鍵なし（pendingのみ等）→ conflict
    if (!user.totpEnabled || !user.totpSecretEnc) {
      return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 });
    }

    // 5) TOTP 検証（失敗理由は秘匿 → auth_failed）
    const verified = await verifyTotpCode(user as any, code);
    if (!verified) {
      return NextResponse.json({ ok: false, error: 'auth_failed' }, { status: 400 });
    }

    // 6) 新規 recoveryCodes 発行（平文10件返却、DBはハッシュ保存）
    const plainCodes = generatePlainRecoveryCodes(10);
    const hashedCodes = plainCodes.map((c) => sha256hex(c));

    await prisma.user.update({
      where: { id: user.id },
      data: {
        recoveryCodes: hashedCodes, // 旧セットを置換＝全失効
      },
    });

    return NextResponse.json({ ok: true, recoveryCodes: plainCodes }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
