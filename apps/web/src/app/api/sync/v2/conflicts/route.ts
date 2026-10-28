import { requireUserId } from '@/server/auth';
import { listConflictsV2 } from '@/server/sync-conflicts-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const userId = await requireUserId(req);
    const conflicts = await listConflictsV2(userId);
    return Response.json({ conflicts }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (error instanceof Response) return error;
    return Response.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}
