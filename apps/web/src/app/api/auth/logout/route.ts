// apps/web/src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  // sec_auth_logout_success
  // 常に 200 + ok:true を返す
  const res = NextResponse.json({ ok: true });

  // sec_auth_logout_cookie_clear
  // sid Cookie を削除する
  res.headers.append(
    'Set-Cookie',
    ['sid=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'].join('; ')
    // 本番 https なら Secure を付与
  );

  // sec_auth_logout_idempotent
  // セッション有無に関係なく成功扱い
  return res;
}
