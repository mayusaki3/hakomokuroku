import { NextResponse } from 'next/server';
import { readSession } from '@/server/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

// sec_settings_user_no_store
const headersNoStore = { 'Cache-Control': 'no-store' };

/**
 * GET /api/settings/user
 *
 * Traceability:
 * - sec_settings_user_no_store: Cache-Control:no-store を返す
 * - sec_settings_user_get_session: readSession でログイン状態を確認する
 * - sec_settings_user_get_unauthorized: 未ログインなら 401 を返す
 * - sec_settings_user_get_find_user: isActive=true のユーザーを findFirst で取得する
 * - sec_settings_user_get_success: 200 + ok:true + user を返す
 * - sec_settings_user_get_not_found: セッションあり + DBユーザーなしは 404 を返す
 * - sec_settings_user_get_null_fields: userName/iconDataUrl null を null のまま返す
 * - sec_settings_user_get_db_error: DB例外時は 500 を返す
 */
export async function GET() {
  try {
    // sec_settings_user_get_session
    const { user } = await readSession();

    // sec_settings_user_get_unauthorized
    if (!user) {
      return NextResponse.json(
        { ok: false, user: null },
        { status: 401, headers: headersNoStore }
      );
    }

    // sec_settings_user_get_find_user
    const u = await prisma.user.findFirst({
      where: { id: user.id, isActive: true },
      select: {
        id: true,
        userId: true,
        userName: true,
        iconDataUrl: true,
        totpEnabled: true,
      },
    });

    // sec_settings_user_get_not_found
    if (!u) {
      return NextResponse.json(
        { ok: false, user: null },
        { status: 404, headers: headersNoStore }
      );
    }

    // sec_settings_user_get_success
    // sec_settings_user_get_null_fields
    return NextResponse.json(
      {
        ok: true,
        user: {
          id: u.id,
          userId: u.userId,
          userName: u.userName ?? null,
          iconDataUrl: u.iconDataUrl ?? null,
          totpEnabled: !!u.totpEnabled,
        },
      },
      { headers: headersNoStore }
    );
  } catch (err) {
    // sec_settings_user_get_db_error
    console.error('GET /api/settings/user failed', err);
    return NextResponse.json(
      { ok: false, user: null },
      { status: 500, headers: headersNoStore }
    );
  }
}

/**
 * PUT /api/settings/user
 *
 * Traceability:
 * - sec_settings_user_no_store: Cache-Control:no-store を返す
 * - sec_settings_user_put_session: readSession でログイン状態を確認する
 * - sec_settings_user_put_unauthorized: 未ログインなら 401 を返す
 * - sec_settings_user_put_parse_body: JSON不正時は validation failure として 400 を返す
 * - sec_settings_user_put_validate_display_name: displayName 未指定/空/非string は 400 を返す
 * - sec_settings_user_put_success: userName を更新し 200 + ok:true を返す
 * - sec_settings_user_put_db_error: DB例外時は 500 を返す
 */
export async function PUT(req: Request) {
  try {
    // sec_settings_user_put_session
    const { user } = await readSession();

    // sec_settings_user_put_unauthorized
    if (!user) {
      return NextResponse.json(
        { ok: false, user: null },
        { status: 401, headers: headersNoStore }
      );
    }

    // sec_settings_user_put_parse_body
    const body = await req.json().catch(() => null) as { displayName?: unknown } | null;

    // sec_settings_user_put_validate_display_name
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    if (!displayName) {
      return NextResponse.json(
        { ok: false, message: 'displayName is required' },
        { status: 400, headers: headersNoStore }
      );
    }

    // sec_settings_user_put_success
    await prisma.user.update({
      where: { id: user.id },
      data: { userName: displayName },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: headersNoStore }
    );
  } catch (err) {
    // sec_settings_user_put_db_error
    console.error('PUT /api/settings/user failed', err);
    return NextResponse.json(
      { ok: false },
      { status: 500, headers: headersNoStore }
    );
  }
}
