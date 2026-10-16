export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

/**
 * Legacy sync-token labeling endpoint.
 * The current Prisma schema has no SyncToken model. Do not silently map
 * a supplied token to AuthSession or Device without an ownership contract.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'not_implemented' },
    { status: 501 }
  );
}
