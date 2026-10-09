// Profile updates are scoped to the authenticated AuthSession user.
// Device names belong to Device, not AuthSession; device updates require a separate device-scoped API.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/server/auth';

export async function PUT(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId(req);
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if ('deviceName' in input) {
    return NextResponse.json({ ok: false, error: 'device_scope_required' }, { status: 400 });
  }
  if (typeof input.userName !== 'string') {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  try {
    await prisma.user.update({ where: { id: userId }, data: { userName: input.userName } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
