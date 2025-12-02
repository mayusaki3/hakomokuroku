import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';

const ALLOW_SKEW = 5 * 60;

function b64urlToBytes(b64: string) {
  b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  return new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
}

export async function GET(req: Request, { params }: { params: { code: string } }) {
  const url = new URL(req.url);
  const t = Number(url.searchParams.get('t') || '0');
  const sig = url.searchParams.get('sig') || '';
  const secret = process.env.QR_SIGN_SECRET || '';
  if (!t || !sig || !secret) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > ALLOW_SKEW)
    return NextResponse.json({ error: 'expired' }, { status: 403 });

  const data = `${params.code}|${t}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    b64urlToBytes(sig),
    new TextEncoder().encode(data)
  );
  if (!ok) return NextResponse.json({ error: 'bad-signature' }, { status: 403 });

  const box = await prisma.box.findUnique({ where: { code: params.code } });
  if (!box) return NextResponse.json({ error: 'not-found' }, { status: 404 });

  // 箱詳細へ 302 リダイレクト（Next のSPA遷移でもOK）
  return NextResponse.redirect(new URL(`/boxes/${box.id}`, url), 302);
}
