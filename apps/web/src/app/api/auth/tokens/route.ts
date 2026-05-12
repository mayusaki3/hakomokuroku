export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/auth/requireUserId';

/**
 * GET /api/auth/tokens
 *
 * Traceability:
 * - sec_auth_tokens_content_type: Content-Type が application/json でない場合は 400
 * - sec_auth_tokens_require_user: requireUserId によりログインユーザーを取得
 * - sec_auth_tokens_unauthorized: 未ログイン / status なし例外は 401
 * - sec_auth_tokens_forbidden: status 付き認可エラーはその status を返す
 * - sec_auth_tokens_success: トークン一覧を 200 で返す
 * - sec_auth_tokens_empty: 0件でも 200 + [] を返す
 * - sec_auth_tokens_db_error: DB例外は 500 相当
 */
export async function GET(req: Request) {
  // sec_auth_tokens_content_type
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  let userId: string;
  try {
    // sec_auth_tokens_require_user
    userId = await requireUserId();
  } catch (e: any) {
    // sec_auth_tokens_unauthorized
    // sec_auth_tokens_forbidden
    const status = typeof e?.status === 'number' ? e.status : 401;
    return NextResponse.json({ error: 'unauthorized' }, { status });
  }

  try {
    // sec_auth_tokens_success
    // sec_auth_tokens_empty
    const rows = await prisma.syncToken.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      select: {
        tokenHash: true,
        issuedAt: true,
        expiresAt: true,
        lastUsedAt: true,
        deviceName: true,
        userAgent: true,
        ip: true,
      },
    });

    return NextResponse.json(rows, { status: 200 });
  } catch (e) {
    // sec_auth_tokens_db_error
    return new NextResponse(null, { status: 500 });
  }
}
