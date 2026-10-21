import Dexie, { type Table } from 'dexie';

/**
 * v0.8 user-scoped local store. This is intentionally separate from the legacy
 * hk-local-v1 database: no implicit migration, fallback or cross-user sharing.
 */
export type BusinessEntityType = 'BOX' | 'ITEM' | 'BOX_LOCATION';
export type OutboxOperation = 'UPSERT' | 'DELETE';
export type RevisionString = string; // signed int64, decimal JSON-safe representation

export interface LocalBusiness {
  id: string;
  revision: RevisionString;
  contentHash: string;
  syncSeq: RevisionString | null;
  deletedAt: string | null;
  updatedAt: string;
}

export interface LocalBox extends LocalBusiness {
  code: string;
  name: string;
  locationId: string | null;
  parentBoxId: string | null;
  tags: string[];
  note: string | null;
  thumbs: string[];
  meta: unknown | null;
  createdAt: string;
}

export interface LocalItem extends LocalBusiness {
  boxId: string | null;
  name: string;
  tags: string[];
  note: string | null;
  thumbs: string[];
  meta: unknown | null;
  createdAt: string;
}

export interface LocalBoxLocation extends LocalBusiness {
  name: string;
  note: string | null;
  thumbs: string[];
  meta: unknown | null;
  createdAt: string;
}

export interface LocalOutbox {
  entityType: BusinessEntityType;
  entityId: string;
  operation: OutboxOperation;
  baseRevision: RevisionString;
  contentHash: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface LocalSyncState {
  id: 'SYNC';
  pullCursor: RevisionString | null;
  lastPullAt: string | null;
  lastPushAt: string | null;
  fullResyncAt: string | null;
}

export class UserLocalDB extends Dexie {
  boxes!: Table<LocalBox, string>;
  items!: Table<LocalItem, string>;
  locations!: Table<LocalBoxLocation, string>;
  outbox!: Table<LocalOutbox, [BusinessEntityType, string]>;
  syncState!: Table<LocalSyncState, string>;

  constructor(userId: string) {
    if (!userId || !userId.trim()) throw new Error('User.id is required for local database');
    super(`hk-local-v2-${userId}`);
    this.version(1).stores({
      boxes: 'id, code, parentBoxId, locationId, deletedAt',
      items: 'id, boxId, deletedAt',
      locations: 'id, name, deletedAt',
      outbox: '[entityType+entityId], entityType, createdAt',
      syncState: 'id',
    });
  }

  async initializeSyncState(): Promise<void> {
    await this.transaction('rw', this.syncState, async () => {
      if (!(await this.syncState.get('SYNC'))) {
        await this.syncState.add({
          id: 'SYNC', pullCursor: null, lastPullAt: null,
          lastPushAt: null, fullResyncAt: null,
        });
      }
    });
  }

  /**
   * Caller must already be in a Dexie transaction containing both the
   * business table and outbox. Keep the first baseRevision on re-edit.
   */
  async upsertOutboxInTransaction(change: LocalOutbox): Promise<void> {
    if (!Dexie.currentTransaction) throw new Error('Outbox update requires an active transaction');
    const existing = await this.outbox.get([change.entityType, change.entityId]);
    await this.outbox.put(existing
      ? { ...change, baseRevision: existing.baseRevision, createdAt: existing.createdAt }
      : change);
  }
}

export function openUserLocalDB(authenticatedUserId: string): UserLocalDB {
  return new UserLocalDB(authenticatedUserId);
}
