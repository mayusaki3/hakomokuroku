import type {
  BusinessEntityType, LocalOutbox, LocalOutboxConflict, UserLocalDB,
} from '@/lib/user-local-db';

export interface PushCandidate {
  entityType: BusinessEntityType;
  entityId: string;
  operation: LocalOutbox['operation'];
  baseRevision: string;
  contentHash: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PushPlan {
  candidates: PushCandidate[];
  blocked: Array<{ entityType: BusinessEntityType; entityId: string; reason: string }>;
}

/**
 * Read-only preflight. A conflict detected by Pull/Resync must never be
 * silently sent as a normal update. No network I/O is performed here.
 *
 * This is NOT a Push transport: server-side idempotency and atomic
 * revision checks must exist before enabling transmission.
 */
export async function planOutboxPush(db: UserLocalDB): Promise<PushPlan> {
  return db.transaction('r', db.outbox, db.outboxConflicts, async () => {
    const entries = await db.outbox.toArray();
    const conflicts = await db.outboxConflicts.toArray();
    const byKey = new Map<string, LocalOutboxConflict>(
      conflicts.map(c => [c.entityType + ':' + c.entityId, c]),
    );
    const candidates: PushCandidate[] = [];
    const blocked: PushPlan['blocked'] = [];
    for (const entry of entries) {
      const conflict = byKey.get(entry.entityType + ':' + entry.entityId);
      if (conflict && (conflict.status !== 'READY' ||
          conflict.baseRevision !== entry.baseRevision)) {
        blocked.push({ entityType: entry.entityType, entityId: entry.entityId,
          reason: conflict.baseRevision !== entry.baseRevision
            ? 'OUTBOX_BASE_REVISION_CHANGED' : conflict.status });
        continue;
      }
      if (!/^(0|[1-9][0-9]*)$/.test(entry.baseRevision) ||
          BigInt(entry.baseRevision) > 9223372036854775807n) {
        blocked.push({ entityType: entry.entityType, entityId: entry.entityId,
          reason: 'INVALID_OUTBOX_REVISION' });
        continue;
      }
      candidates.push({
        entityType: entry.entityType, entityId: entry.entityId,
        operation: entry.operation, baseRevision: entry.baseRevision,
        contentHash: entry.contentHash, payload: entry.payload,
        createdAt: entry.createdAt,
      });
    }
    return { candidates, blocked };
  });
}
