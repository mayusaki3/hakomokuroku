import type {
  BusinessEntityType, LocalBox, LocalBoxLocation, LocalItem,
  LocalOutbox, LocalOutboxConflict, UserLocalDB,
} from '@/lib/user-local-db';

export type RemoteBusinessRecord = LocalBox | LocalItem | LocalBoxLocation;

function revision(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new Error('INVALID_OUTBOX_REVISION');
  }
  return BigInt(value);
}

/**
 * Classify pending local changes against an authoritative server projection.
 * Does not mutate Outbox or Business. A server deletion is never silently
 * treated as a successful local UPSERT.
 */
export function classifyOutbox(
  pending: LocalOutbox,
  remote: RemoteBusinessRecord | null,
): LocalOutboxConflict {
  const base = revision(pending.baseRevision);
  const current = remote ? revision(remote.revision) : null;
  const status = remote === null
    ? (base === 0n ? 'READY' : 'REMOTE_MISSING')
    : remote.deletedAt !== null
      ? 'REMOTE_DELETED'
      : current === base ? 'READY' : 'CONFLICT';
  return {
    entityType: pending.entityType, entityId: pending.entityId,
    status, baseRevision: pending.baseRevision,
    remoteRevision: remote?.revision ?? null,
    remoteDeleted: remote !== null && remote.deletedAt !== null,
    remoteRecord: remote,
  };
}

export async function reconcileOutboxRecord(
  db: UserLocalDB, entityType: BusinessEntityType, entityId: string,
  remote: RemoteBusinessRecord | null,
): Promise<void> {
  await db.transaction('rw', db.outbox, db.outboxConflicts, async () => {
    const pending = await db.outbox.get([entityType, entityId]);
    if (!pending) {
      await db.outboxConflicts.delete([entityType, entityId]);
      return;
    }
    await db.outboxConflicts.put(classifyOutbox(pending, remote));
  });
}

/** Re-evaluate every pending operation after Full Resync adoption. */
export async function reconcileOutboxAfterResync(
  db: UserLocalDB,
  remote: ReadonlyMap<string, RemoteBusinessRecord>,
): Promise<void> {
  await db.transaction('rw', db.outbox, db.outboxConflicts, async () => {
    const pending = await db.outbox.toArray();
    const keys = new Set(pending.map(p => p.entityType + ':' + p.entityId));
    for (const existing of await db.outboxConflicts.toArray()) {
      if (!keys.has(existing.entityType + ':' + existing.entityId)) {
        await db.outboxConflicts.delete([existing.entityType, existing.entityId]);
      }
    }
    for (const change of pending) {
      const record = remote.get(change.entityType + ':' + change.entityId) ?? null;
      await db.outboxConflicts.put(classifyOutbox(change, record));
    }
  });
}
