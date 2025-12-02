import { NextResponse } from 'next/server';

const lifetimeSec = 5 * 60; // 5分

function b64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  const base = `${u.protocol}//${u.host}`; // 生成元ホストを使う（自己ホスト想定）
  const t = Math.floor(Date.now() / 1000);
  const secret = process.env.QR_SIGN_SECRET || '';
  if (!secret) return NextResponse.json({ error: 'server not configured' }, { status: 500 });

  const data = `${code}|${t}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const url = `${base}/b/${encodeURIComponent(code)}?t=${t}&sig=${b64url(sig)}`;

  return NextResponse.json({ url, exp: t + lifetimeSec });
}
