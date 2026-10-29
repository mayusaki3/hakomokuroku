import { requireUserId } from '@/server/auth';
import { ConflictResolveError, keepServerV2 } from '@/server/sync-conflict-resolve-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, context: { params: { conflictId: string } }) {
  try {
    const userId = await requireUserId(req);
    let body: unknown;
    try { body = await req.json(); }
    catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (input.resolution !== 'KEEP_SERVER' ||
        typeof input.expectedServerRevision !== 'string' ||
        Object.keys(input).some(key => !['resolution', 'expectedServerRevision'].includes(key))) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    const result = await keepServerV2(userId, context.params.conflictId, input.expectedServerRevision);
    return Response.json(result.status === 'CONFLICT_STALE'
      ? { error: 'CONFLICT_STALE', ...result }
      : result, {
      status: result.status === 'CONFLICT_STALE' ? 409 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof ConflictResolveError) {
      return Response.json({ error: error.code }, { status: error.status });
    }
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (error instanceof Response) return error;
    return Response.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}
