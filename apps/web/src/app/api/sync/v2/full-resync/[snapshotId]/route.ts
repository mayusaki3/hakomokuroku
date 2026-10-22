import { requireUserId } from '@/server/auth';
import { FullResyncError } from '@/server/full-resync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(error: unknown): Response {
  if (error instanceof FullResyncError) return Response.json({ error: error.code }, { status: error.status });
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (error instanceof Response) return error;
  return Response.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
}

import { parseSnapshotLimit, parseSnapshotOffset, readFullResyncPage } from '@/server/full-resync';

export async function GET(req: Request, context: { params: { snapshotId: string } }) {
  try {
    const userId = await requireUserId(req);
    const url = new URL(req.url);
    const page = await readFullResyncPage(
      userId, context.params.snapshotId,
      parseSnapshotOffset(url.searchParams.get('offset')),
      parseSnapshotLimit(url.searchParams.get('limit')),
    );
    return Response.json(page, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
