import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth';
import { BoxDeleteError, deleteBoxTransaction } from '@/server/box-delete-transaction';

export async function POST(req: Request, context: { params: { id: string } }) {
  let userId: string;
  try {
    userId = await requireUserId(req);
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const rawRevision = body && typeof body === 'object' && 'baseRevision' in body
    ? (body as { baseRevision: unknown }).baseRevision
    : undefined;
  if (
    (typeof rawRevision !== 'string' && typeof rawRevision !== 'number') ||
    !/^(0|[1-9][0-9]*)$/.test(String(rawRevision))
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_base_revision' }, { status: 400 });
  }
  try {
    const result = await deleteBoxTransaction(userId, context.params.id, BigInt(rawRevision));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof BoxDeleteError) {
      return NextResponse.json(
        { ok: false, error: error.code.toLowerCase() },
        { status: error.code === 'NOT_FOUND' ? 404 : 409 },
      );
    }
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
