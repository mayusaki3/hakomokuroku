import { NextResponse } from 'next/server';

// …認証処理の後、token を生成済みとして…
function setLoginCookie(token: string) {
  const res = NextResponse.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    [
      `hk_token=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      // 本番 https の場合は Secure を追加:
      // 'Secure',
    ].join('; ')
  );
  return res;
}

// 例:
// export async function POST(req: Request) {
//   // 認証 …
//   const token = issuedToken;
//   return setLoginCookie(token);
// }
