// apps/web/src/app/api/auth/tokens/revokeAll/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

/**
 * POST /api/auth/tokens/revokeAll
 *
 * Traceability:
 * - sec_auth_tokens_revoke_all_content_type: Content-Type が application/json でない場合は 400
 * - sec_auth_tokens_revoke_all_require_user: requireUserId によりログインユーザーを取得
 * - sec_auth_tokens_revoke_all_success: ログインユーザーの SyncToken を全削除し 204 を返す
 * - sec_auth_tokens_revoke_all_security: deleteMany.where.userId をログインユーザーに限定
 * - sec_auth_tokens_revoke_all_internal_error: Prisma 例外などは 500 相当にする
 */
export async function POST(req: Request) {
  // sec_auth_tokens_revoke_all_require_user
  const uid = await requireUserId(req);

  // sec_auth_tokens_revoke_all_content_type
  if (!/application\/json/i.test(req.headers.get('content-type') || '')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    // sec_auth_tokens_revoke_all_success
    // sec_auth_tokens_revoke_all_security
    await prisma.syncToken.deleteMany({
      where: { userId: uid },
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    // sec_auth_tokens_revoke_all_internal_error
    return new NextResponse(null, { status: 500 });
  }
}
