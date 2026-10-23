import type {
  BusinessEntityType, LocalBox, LocalBoxLocation, LocalItem, LocalResyncEntity,
  RevisionString, UserLocalDB,
} from '@/lib/user-local-db';

type BusinessRecord = LocalBox | LocalItem | LocalBoxLocation;
export interface FullResyncEntity {
  entityType: BusinessEntityType;
  entityId: string;
  payload: Record<string, unknown>;
  revision: RevisionString;
  contentHash: string;
  syncSeq: RevisionString;
  serverUpdatedAt: string;
  deleted: boolean;
}
export interface FullResyncPage {
  snapshotId: string;
  snapshotSeq: RevisionString;
  entities: FullResyncEntity[];
  nextOffset: number;
  hasMore: boolean;
}

function validSeq(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('INVALID_RESYNC_SEQUENCE');
  const seq = BigInt(value);
  if (seq > 9223372036854775807n) throw new Error('INVALID_RESYNC_SEQUENCE');
  return seq;
}
function key(type: BusinessEntityType, id: string): string { return type + ':' + id; }

function decode(entity: FullResyncEntity, upper: bigint): LocalResyncEntity {
  const { entityType, entityId, payload } = entity;
  if (!['BOX', 'ITEM', 'BOX_LOCATION'].includes(entityType) || !entityId || payload.id !== entityId) {
    throw new Error('INVALID_RESYNC_ENTITY');
  }
  if (validSeq(entity.syncSeq) > upper || validSeq(entity.revision) < 0n) {
    throw new Error('INVALID_RESYNC_ENTITY');
  }
  if (typeof entity.contentHash !== 'string' || typeof payload.name !== 'string' ||
      typeof payload.createdAt !== 'string' || typeof payload.updatedAt !== 'string') {
    throw new Error('INVALID_RESYNC_ENTITY');
  }
  const record = {
    ...payload, id: entityId, revision: entity.revision,
    contentHash: entity.contentHash, syncSeq: entity.syncSeq,
  } as unknown as BusinessRecord;
  return { key: key(entityType, entityId), entityType, entityId, record };
}

/** Start a new staging session; never touch current Business or Outbox. */
export async function beginFullResync(db: UserLocalDB, snapshotId: string, snapshotSeq: string) {
  if (!snapshotId) throw new Error('INVALID_RESYNC_SNAPSHOT');
  validSeq(snapshotSeq);
  await db.transaction('rw', db.resyncStage, db.resyncEntities, async () => {
    await db.resyncEntities.clear();
    await db.resyncStage.put({ id: 'STAGE', snapshotId, snapshotSeq, nextOffset: 0, complete: false });
  });
}

/** Each page and its offset commit together, allowing retry after interruption. */
export async function stageFullResyncPage(db: UserLocalDB, page: FullResyncPage): Promise<void> {
  await db.transaction('rw', db.resyncStage, db.resyncEntities, async () => {
    const stage = await db.resyncStage.get('STAGE');
    if (!stage || stage.snapshotId !== page.snapshotId || stage.snapshotSeq !== page.snapshotSeq) {
      throw new Error('RESYNC_SNAPSHOT_MISMATCH');
    }
    if (stage.complete) throw new Error('RESYNC_ALREADY_COMPLETE');
    if (!Number.isSafeInteger(page.nextOffset) ||
        page.nextOffset !== stage.nextOffset + page.entities.length ||
        (page.hasMore && page.entities.length === 0)) {
      throw new Error('RESYNC_PAGE_INVALID');
    }
    const upper = validSeq(stage.snapshotSeq);
    const rows = page.entities.map(entity => decode(entity, upper));
    const unique = new Set(rows.map(row => row.key));
    if (unique.size !== rows.length) throw new Error('RESYNC_DUPLICATE_ENTITY');
    for (const row of rows) {
      if (await db.resyncEntities.get(row.key)) throw new Error('RESYNC_DUPLICATE_ENTITY');
    }
    await db.resyncEntities.bulkPut(rows);
    await db.resyncStage.put({ ...stage, nextOffset: page.nextOffset, complete: !page.hasMore });
  });
}

/** Commit only after caller has fetched and staged the final page. */
export async function commitFullResync(db: UserLocalDB, snapshotId: string, expectedTotal: number): Promise<void> {
  await db.transaction('rw',
    [db.boxes, db.items, db.locations, db.outbox, db.syncState, db.resyncStage, db.resyncEntities],
    async () => {
      const stage = await db.resyncStage.get('STAGE');
      if (!stage || stage.snapshotId !== snapshotId || !stage.complete || stage.nextOffset !== expectedTotal ||
          await db.resyncEntities.count() !== expectedTotal) {
        throw new Error('RESYNC_INCOMPLETE');
      }
      const rows = await db.resyncEntities.toArray();
      const pending = await db.outbox.toArray();
      const pendingKeys = new Set(pending.map(row => key(row.entityType, row.entityId)));
      // Preserve local unsynced projections. Outbox remains unchanged.
      const localBoxes = await db.boxes.toArray();
      const localItems = await db.items.toArray();
      const localLocations = await db.locations.toArray();
      const preserved: LocalResyncEntity[] = [
        ...localBoxes.map(record => ({ key: key('BOX', record.id), entityType: 'BOX' as const, entityId: record.id, record })),
        ...localItems.map(record => ({ key: key('ITEM', record.id), entityType: 'ITEM' as const, entityId: record.id, record })),
        ...localLocations.map(record => ({ key: key('BOX_LOCATION', record.id), entityType: 'BOX_LOCATION' as const, entityId: record.id, record })),
      ].filter(row => pendingKeys.has(row.key));
      await db.boxes.clear();
      await db.items.clear();
      await db.locations.clear();
      const combined = new Map(rows.map(row => [row.key, row]));
      for (const row of preserved) combined.set(row.key, row);
      const merged = [...combined.values()];
      await db.locations.bulkPut(merged.filter(row => row.entityType === 'BOX_LOCATION').map(row => row.record as LocalBoxLocation));
      await db.boxes.bulkPut(merged.filter(row => row.entityType === 'BOX').map(row => row.record as LocalBox));
      await db.items.bulkPut(merged.filter(row => row.entityType === 'ITEM').map(row => row.record as LocalItem));
      const state = await db.syncState.get('SYNC');
      if (!state) throw new Error('RESYNC_STATE_MISSING');
      await db.syncState.put({
        ...state, pullCursor: stage.snapshotSeq, fullResyncAt: new Date().toISOString(),
      });
      await db.resyncEntities.clear();
      await db.resyncStage.delete('STAGE');
    },
  );
}
