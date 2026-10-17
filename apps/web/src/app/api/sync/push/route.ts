import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth';

// Legacy timestamp-based push is incompatible with the revisioned sync schema.
// Reject writes rather than partially importing or overwriting user data.
export async function POST(req: Request) {
  await requireUserId(req);
  return NextResponse.json(
    { ok: false, error: 'legacy_sync_unsupported', message: 'Use the revision-aware synchronization API.' },
    { status: 501 },
  );
}
