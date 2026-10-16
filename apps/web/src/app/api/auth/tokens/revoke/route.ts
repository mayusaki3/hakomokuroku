export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

/**
 * Legacy SyncToken revocation endpoint.
 * SyncToken is absent from the current Prisma schema. Revocation must be
 * redesigned against AuthSession/Device with explicit ownership checks.
 * Returning 501 avoids pretending that a session has been revoked.
 */
export async function POST() {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
