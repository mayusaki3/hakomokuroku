import type { LocalOutbox, LocalBusiness, UserLocalDB } from '@/lib/user-local-db';
import { planOutboxPush, type PushCandidate } from '@/lib/outbox-push-plan';

export interface PreparedPush extends PushCandidate {
  operationId: string;
}
export interface PushReply {
  operationId: string;
  status: 'APPLIED' | 'UNCHANGED' | 'CONFLICT';
  revision: string;
  syncSeq: string | null;
}
export interface PushRunResult {
  applied: number;
  conflicts: number;
  blocked: number;
}

/**
 * Assign IDs to legacy pending entries in a short IndexedDB transaction.
 * IDs must be durable before HTTP is attempted, including if the reply is lost.
 */
export async function prepareOutboxPush(db: UserLocalDB): Promise<{
  candidates: PreparedPush[];
  blocked: Awaited<ReturnType<typeof planOutboxPush>>['blocked'];
}> {
  await db.transaction('rw', db.outbox, async () => {
    for (const entry of await db.outbox.toArray()) {
      if (!entry.operationId) {
        await db.outbox.put({ ...entry, operationId: crypto.randomUUID() });
      }
    }
  });
  const plan = await planOutboxPush(db);
  const candidates: PreparedPush[] = [];
  for (const entry of plan.candidates) {
    const stored = await db.outbox.get([entry.entityType, entry.entityId]);
    if (stored?.operationId && sameEdit(stored, entry)) {
      candidates.push({ ...entry, operationId: stored.operationId });
    }
  }
  return { candidates, blocked: plan.blocked };
}

function sameEdit(
  current: LocalOutbox,
  sent: Pick<PreparedPush, 'entityType' | 'entityId' | 'operation' |
    'baseRevision' | 'contentHash' | 'payload' | 'createdAt'>,
): boolean {
  return current.entityType === sent.entityType &&
    current.entityId === sent.entityId &&
    current.operation === sent.operation &&
    current.baseRevision === sent.baseRevision &&
    current.contentHash === sent.contentHash &&
    current.createdAt === sent.createdAt &&
    JSON.stringify(current.payload) === JSON.stringify(sent.payload);
}

/** Never clear a newer edit after an older in-flight Push completes. */
export async function acknowledgePush(
  db: UserLocalDB, sent: PreparedPush, reply: PushReply,
): Promise<boolean> {
  if (reply.operationId !== sent.operationId ||
      (reply.status !== 'APPLIED' && reply.status !== 'UNCHANGED') ||
      !/^[1-9][0-9]*$/.test(reply.revision) ||
      reply.syncSeq === null || !/^[1-9][0-9]*$/.test(reply.syncSeq)) {
    throw new Error('INVALID_PUSH_ACK');
  }
  const table = sent.entityType === 'BOX' ? db.boxes : sent.entityType === 'ITEM' ? db.items : db.locations;
  return db.transaction('rw', [db.outbox, db.pushPending, db.outboxConflicts, db.syncState, table], async () => {
    const current = await db.outbox.get([sent.entityType, sent.entityId]);
    await db.pushPending.delete([sent.entityType, sent.entityId]);
    if (!current) return false;
    if (current.operationId !== sent.operationId || !sameEdit(current, sent)) {
      // An edit made during the request supersedes the sent payload.
      // The accepted revision is its new base; do not discard the newer edit.
      // Only rebase if the current edit still descends from the sent base.
      if (current.baseRevision !== sent.baseRevision) return false;
      const updated = { ...current, baseRevision: reply.revision,
        operationId: crypto.randomUUID() };
      await db.outbox.put(updated);
      await db.outboxConflicts.delete([sent.entityType, sent.entityId]);
      const local = await table.get(sent.entityId) as LocalBusiness | undefined;
      if (local) {
        await table.update(sent.entityId, { revision: reply.revision, syncSeq: reply.syncSeq });
      }
      const state = await db.syncState.get('SYNC');
      if (state) await db.syncState.put({ ...state, lastPushAt: new Date().toISOString() });
      return false;
    }
    // Acknowledged local projection must carry the authoritative server version.
    const local = await table.get(sent.entityId) as LocalBusiness | undefined;
    if (local) {
      await table.update(sent.entityId, { revision: reply.revision, syncSeq: reply.syncSeq });
    }
    await db.outbox.delete([sent.entityType, sent.entityId]);
    await db.outboxConflicts.delete([sent.entityType, sent.entityId]);
    const state = await db.syncState.get('SYNC');
    if (state) await db.syncState.put({ ...state, lastPushAt: new Date().toISOString() });
    return true;
  });
}

/**
 * A conflict is recorded without overwriting local Business or Outbox.
 * Pull/Full Resync will subsequently attach the authoritative remote record.
 */
export async function recordPushConflict(
  db: UserLocalDB, sent: PreparedPush, reply: PushReply,
): Promise<boolean> {
  if (reply.operationId !== sent.operationId || reply.status !== 'CONFLICT' ||
      !/^(0|[1-9][0-9]*)$/.test(reply.revision)) {
    throw new Error('INVALID_PUSH_CONFLICT');
  }
  return db.transaction('rw', db.outbox, db.pushPending, db.outboxConflicts, async () => {
    const current = await db.outbox.get([sent.entityType, sent.entityId]);
    await db.pushPending.delete([sent.entityType, sent.entityId]);
    if (!current) return false;
    // The original request was rejected. Even when the user edited again
    // while its reply was missing, the newer edit still descends from the
    // rejected base and must not be sent automatically.
    if (current.baseRevision !== sent.baseRevision) return false;
    await db.outboxConflicts.put({
      entityType: sent.entityType, entityId: sent.entityId,
      status: 'CONFLICT', baseRevision: current.baseRevision,
      remoteRevision: reply.revision, remoteDeleted: false, remoteRecord: null,
    });
    return true;
  });
}

export async function runOutboxPush(
  db: UserLocalDB,
  options: { fetcher?: typeof fetch; baseUrl?: string; signal?: AbortSignal } = {},
): Promise<PushRunResult> {
  const fetcher = options.fetcher ?? fetch;
  let applied = 0;
  let conflicts = 0;
  const send = async (sent: PreparedPush): Promise<void> => {
    if (options.signal?.aborted) throw new Error('PUSH_ABORTED');
    const response = await fetcher((options.baseUrl ?? '') + '/api/sync/v2/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', signal: options.signal,
      body: JSON.stringify(sent),
    });
    if (response.status !== 200 && response.status !== 409) {
      throw new Error('PUSH_HTTP_' + response.status);
    }
    const reply = await response.json() as PushReply & { error?: string };
    if (response.status === 409 && reply.status !== 'CONFLICT') {
      throw new Error(reply.error ?? 'PUSH_HTTP_409');
    }
    if (response.status === 200) {
      if (await acknowledgePush(db, sent, reply)) applied++;
    } else if (await recordPushConflict(db, sent, reply)) {
      conflicts++;
    }
  };

  // Replay durable requests first. A newer local edit may have replaced its
  // operationId, but the server receipt is still keyed to the original ID.
  for (const pending of await db.pushPending.toArray()) {
    await send(pending);
  }

  const plan = await prepareOutboxPush(db);
  for (const sent of plan.candidates) {
    if (options.signal?.aborted) throw new Error('PUSH_ABORTED');
    await db.transaction('rw', db.outbox, db.pushPending, async () => {
      const current = await db.outbox.get([sent.entityType, sent.entityId]);
      if (!current || current.operationId !== sent.operationId || !sameEdit(current, sent)) return;
      if (await db.pushPending.get([sent.entityType, sent.entityId])) return;
      // Commit the exact request before network I/O.
      await db.pushPending.put(sent);
    });
    const journaled = await db.pushPending.get([sent.entityType, sent.entityId]);
    if (!journaled || journaled.operationId !== sent.operationId) continue;
    await send(sent);
  }
  return { applied, conflicts, blocked: plan.blocked.length };
}
