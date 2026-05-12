// apps/web/src/app/api/auth/tokens/revoke/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

/**
 * POST /api/auth/tokens/revoke
 *
 * Traceability:
 * - sec_auth_tokens_revoke_require_user: requireUserId によりログインユーザーを取得
 * - sec_auth_tokens_revoke_content_type: Content-Type が application/json でない場合は 400
 * - sec_auth_tokens_revoke_invalid_request: JSON 不正または id 未指定/非 string は 400
 * - sec_auth_tokens_revoke_find_token: SyncToken.id で対象トークンを検索
 * - sec_auth_tokens_revoke_not_found: 不存在または userId 不一致は 404
 * - sec_auth_tokens_revoke_security: 他ユーザーのトークン指定でも 404 にする
 * - sec_auth_tokens_revoke_success: 対象トークンを削除し 204 を返す
 * - sec_auth_tokens_revoke_internal_error: Prisma 例外などは 500 相当にする
 */
export async function POST(req: Request) {
  // sec_auth_tokens_revoke_require_user
  const uid = await requireUserId(req);

  // sec_auth_tokens_revoke_content_type
  // CSRF 簡易対策：JSON 必須
  if (!/application\/json/i.test(req.headers.get('content-type') || '')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // sec_auth_tokens_revoke_invalid_request
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // sec_auth_tokens_revoke_invalid_request
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { id } = body as { id?: unknown };
  if (typeof id !== 'string' || id.trim() === '') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    // sec_auth_tokens_revoke_find_token
    const token = await prisma.syncToken.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    // sec_auth_tokens_revoke_not_found
    // sec_auth_tokens_revoke_security
    // 存在しない or 他人のトークン → 404（権限の有無を匂わせない）
    if (!token || token.userId !== uid) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // sec_auth_tokens_revoke_success
    await prisma.syncToken.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    // sec_auth_tokens_revoke_internal_error
    return new NextResponse(null, { status: 500 });
  }
}
