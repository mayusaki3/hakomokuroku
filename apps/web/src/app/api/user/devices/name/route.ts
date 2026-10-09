export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth';
import { prisma } from '@/server/prisma';

// Device identity is distinct from an authentication session.
// A caller must supply an explicit deviceId; ownership is enforced by userId + deviceId.
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
  if (typeof input.deviceId !== 'string' || !input.deviceId.trim() ||
      input.deviceId.length > 128 || typeof input.deviceName !== 'string' ||
      !input.deviceName.trim() || input.deviceName.length > 100) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  try {
    const result = await prisma.device.updateMany({
      where: { userId, deviceId: input.deviceId.trim() },
      data: { name: input.deviceName.trim() },
    });
    if (result.count === 0) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
