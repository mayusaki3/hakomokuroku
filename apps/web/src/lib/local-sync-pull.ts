import type {
  BusinessEntityType, LocalBox, LocalBoxLocation, LocalItem, RevisionString, UserLocalDB,
} from '@/lib/user-local-db';

export type PullChange =
  | { entityType: 'BOX'; entityId: string; syncSeq: RevisionString; record: LocalBox }
  | { entityType: 'ITEM'; entityId: string; syncSeq: RevisionString; record: LocalItem }
  | { entityType: 'BOX_LOCATION'; entityId: string; syncSeq: RevisionString; record: LocalBoxLocation };

export interface PullPage {
  changes: PullChange[];
  nextCursor: RevisionString;
}

function sequence(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('INVALID_SYNC_SEQUENCE');
  return BigInt(value);
}

/**
 * Applies a verified v0.8 syncSeq page. A pending local Outbox entry wins
 * in the local projection until Push/conflict resolution; the server snapshot
 * is not discarded by the caller and must remain available for reconciliation.
 * No network request or non-IDB asynchronous work occurs in this transaction.
 */
export async function applyPullPage(db: UserLocalDB, page: PullPage): Promise<number> {
  return db.transaction('rw', db.boxes, db.items, db.locations, db.outbox, db.syncState, async () => {
    const state = await db.syncState.get('SYNC');
    if (!state || state.pullCursor === null) throw new Error('FULL_RESYNC_REQUIRED');

    const initial = sequence(state.pullCursor);
    const end = sequence(page.nextCursor);
    if (end < initial) throw new Error('PULL_CURSOR_REGRESSION');

    let previous = initial;
    let applied = 0;
    for (const change of page.changes) {
      const seq = sequence(change.syncSeq);
      if (seq <= previous || seq > end) throw new Error('PULL_SEQUENCE_INVALID');
      if (change.record.id !== change.entityId || change.record.syncSeq !== change.syncSeq) {
        throw new Error('PULL_RECORD_MISMATCH');
      }
      previous = seq;

      const pending = await db.outbox.get([change.entityType, change.entityId]);
      if (pending) continue;

      switch (change.entityType) {
        case 'BOX':
          await db.boxes.put(change.record);
          break;
        case 'ITEM':
          await db.items.put(change.record);
          break;
        case 'BOX_LOCATION':
          await db.locations.put(change.record);
          break;
      }
      applied++;
    }

    await db.syncState.put({ ...state, pullCursor: page.nextCursor, lastPullAt: new Date().toISOString() });
    return applied;
  });
}
