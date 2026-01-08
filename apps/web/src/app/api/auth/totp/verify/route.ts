/**
 * apps/web/src/app/api/auth/totp/verify/route.ts
 *
 * TOTP 有効化（verify）API。
 *
 * 方針：
 * - API はカバレッジ 100% を厳守（UI は別）。
 * - 入力検証は早期 return（例外にしない）。
 * - 例外（throw）は HTTP にマッピングして握りつぶす（テスト安定化）。
 */

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/server/auth';
import {
  isTotp6,
  verifyTotpPendingCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  type TotpUserLike,
} from '@/server/totp';

/**
 * Content-Type が application/json かを判定する。
 * - headers.get() が null を返すケースがあるため nullish を踏めるようにする（カバレッジ目的）。
 */
function isJsonContentType(req: Request): boolean {
  const ct = req.headers.get('content-type') ?? '';
  return /application\/json/i.test(ct);
}

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function invalidRequest() {
  return json(400, { ok: false, error: 'invalid_request' });
}

function unauthorized() {
  return json(401, { ok: false, error: 'unauthorized' });
}

function notFound() {
  return json(404, { ok: false, error: 'not_found' });
}

function conflict() {
  return json(409, { ok: false, error: 'conflict' });
}

function authFailed() {
  return json(400, { ok: false, error: 'auth_failed' });
}

function internalError() {
  return json(500, { ok: false, error: 'internal_error' });
}

/**
 * 例外を API のエラー応答に変換する。
 * - getCurrentUser / server 側ユーティリティが throw するケースをテストで期待しているため、
 *   message ベースで最低限マッピングする。
 */
function mapThrownToResponse(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? '');

  // 認証系
  if (msg === 'UNAUTHORIZED') return unauthorized();

  // （将来）内部ユーティリティが投げる可能性があるもの
  if (msg === 'NOT_FOUND') return notFound();
  if (msg === 'CONFLICT') return conflict();
  if (msg === 'AUTH_FAILED') return authFailed();

  return internalError();
}

export async function POST(req: Request) {
  try {
    // 1) Content-Type
    if (!isJsonContentType(req)) return invalidRequest();

    // 2) JSON parse
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return invalidRequest();
    }

    // 3) 入力検証
    const code = (body as { code?: unknown } | null | undefined)?.code;
    if (typeof code !== 'string') return invalidRequest();
    if (!isTotp6(code)) return invalidRequest();

    // 4) 認証（未ログインは 401）
    let me: { id?: string | null } | null = null;
    try {
      // 実装側の関数シグネチャが変わっても対応できるよう、Request を渡す
      me = (await (getCurrentUser as unknown as (r: Request) => Promise<any>)(req)) ?? null;
    } catch (e) {
      // getCurrentUser が throw('UNAUTHORIZED') を返すケース
      return mapThrownToResponse(e);
    }
    if (!me?.id) return unauthorized();

    // 5) ユーザー取得
    const user = await prisma.user.findUnique({
      where: { id: me.id },
      select: {
        id: true,
        totpEnabled: true,
        totpSecretEnc: true,
        totpPendingSecretEnc: true,
        totpFailCount: true,
        totpRecoveryCodes: true,
      },
    });

    if (!user) return notFound();

    // 6) 既に有効なら conflict
    if (user.totpEnabled) return conflict();

    // 7) setup 未実行（pending が無い）なら conflict
    if (!user.totpPendingSecretEnc) return conflict();

    // 8) code 検証
    const ok = await verifyTotpPendingCode(user as TotpUserLike, code);

    if (!ok) {
      // 失敗回数インクリメント（null は 0 扱い）
      const nextFail = (user.totpFailCount ?? 0) + 1;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          totpFailCount: nextFail,
        },
        select: { id: true },
      });

      return authFailed();
    }

    // 9) 成功：TOTP 有効化 + recovery codes 発行
    const recoveryCodes = generateRecoveryCodes(10);
    const hashed = recoveryCodes.map((c) => hashRecoveryCode(c));

    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: true,
        // pending -> secret に昇格
        totpSecretEnc: user.totpPendingSecretEnc,
        totpPendingSecretEnc: null,
        // 失敗回数はリセット（null を許容するなら 0 固定）
        totpFailCount: 0,
        totpRecoveryCodes: hashed,
      },
      select: { id: true },
    });

    return json(200, { ok: true, recoveryCodes });
  } catch (e) {
    return mapThrownToResponse(e);
  }
}
