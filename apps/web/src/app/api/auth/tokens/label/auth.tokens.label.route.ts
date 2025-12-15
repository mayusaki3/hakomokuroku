export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';
import crypto from 'crypto';

function extractPlainToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  const cookie = req.headers.get('cookie') || '';
  const m2 = cookie.match(/(?:^|;\s*)hk_token=([^;]+)/);
  return m2 ? decodeURIComponent(m2[1]) : null;
}

export async function POST(req: Request) {
  const uid = await requireUserId(req);
  if (!/application\/json/i.test(req.headers.get('content-type') || '')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const { deviceName } = await req.json();
  if (!deviceName || typeof deviceName !== 'string') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const plain = extractPlainToken(req);
  if (!plain) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const tokenHash = crypto.createHash('sha256').update(plain, 'utf8').digest('hex');
  const tok = await prisma.syncToken.findUnique({ where: { tokenHash } });
  if (!tok || tok.userId !== uid) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await prisma.syncToken.update({
    where: { tokenHash },
    data: { deviceName: deviceName.slice(0, 80) },
  });
  return new NextResponse(null, { status: 204 });
}
