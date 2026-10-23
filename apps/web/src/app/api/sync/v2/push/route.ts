import { requireUserId } from '@/server/auth';
import { applyPushV2 } from '@/server/sync-push-v2';
import { PushV2Error } from '@/server/sync-push-protocol';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const userId = await requireUserId(req);
    let body: unknown;
    try { body = await req.json(); }
    catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }); }
    const result = await applyPushV2(userId, body);
    return Response.json(result, {
      status: result.status === 'CONFLICT' ? 409 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof PushV2Error) {
      return Response.json({ error: error.code }, { status: error.status });
    }
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (error instanceof Response) return error;
    return Response.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}
