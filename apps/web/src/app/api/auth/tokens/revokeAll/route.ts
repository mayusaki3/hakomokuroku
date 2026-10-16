export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

/**
 * Legacy SyncToken bulk revocation endpoint.
 * SyncToken is absent from the current Prisma schema. Do not claim sessions
 * have been revoked until AuthSession/Device semantics are implemented.
 */
export async function POST() {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
