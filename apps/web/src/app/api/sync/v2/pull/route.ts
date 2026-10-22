import { requireUserId } from '@/server/auth';
import { parsePullCursor, parsePullLimit, PullV2Error, readPullPage } from '@/server/sync-pull-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const userId = await requireUserId(req);
    const url = new URL(req.url);
    const cursor = parsePullCursor(url.searchParams.get('cursor'));
    const limit = parsePullLimit(url.searchParams.get('limit'));
    const page = await readPullPage(userId, cursor, limit);
    return Response.json(page, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PullV2Error) {
      return Response.json({ error: error.code }, { status: error.status });
    }
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (error instanceof Response) return error;
    return Response.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}
