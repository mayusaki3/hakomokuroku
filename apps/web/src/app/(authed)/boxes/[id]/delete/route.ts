// Legacy endpoint retained for compatibility; deletion must be implemented
// through the authenticated, user-scoped sync/domain API.
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'not_implemented', message: 'Use the authenticated box deletion workflow.' },
    { status: 501 }
  );
}
