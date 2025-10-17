// apps/web/src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    ['hk_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'].join('; ')
    // 本番 https なら ; Secure も付与
  );
  return res;
}
