import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/server/prisma';

export const FULL_RESYNC_PAGE_LIMIT = 200;
export const FULL_RESYNC_TTL_MS = 60 * 60 * 1000;

export class FullResyncError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

function snapshotPayload(record: Record<string, unknown>): Prisma.InputJsonValue {
  // Prisma JSON cannot contain bigint or Date. Preserve the canonical fields
  // in the same JSON-safe representation returned by HTTP endpoints.
  return JSON.parse(JSON.stringify(record, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value)) as Prisma.InputJsonValue;
}

export function parseSnapshotOffset(raw: string | null): number {
  if (raw === null) return 0;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new FullResyncError('INVALID_OFFSET', 400);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new FullResyncError('INVALID_OFFSET', 400);
  return value;
}

export function parseSnapshotLimit(raw: string | null): number {
  if (raw === null) return 100;
  if (!/^[1-9][0-9]*$/.test(raw)) throw new FullResyncError('INVALID_LIMIT', 400);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > FULL_RESYNC_PAGE_LIMIT) {
    throw new FullResyncError('INVALID_LIMIT', 400);
  }
  return value;
}

export async function createFullResyncSnapshot(
  userId: string, client: PrismaClient = prisma, now: Date = new Date(),
) {
  if (!Number.isFinite(now.getTime())) throw new FullResyncError('INVALID_DATE', 400);
  const snapshotId = randomUUID();
  const expiresAt = new Date(now.getTime() + FULL_RESYNC_TTL_MS);
  // Read the sequence and all canonical records inside the same transaction.
  // The snapshot entities remain immutable after commit.
  return client.$transaction(async tx => {
    const sequence = await tx.syncSequence.findFirst({ orderBy: { lastSeq: 'desc' } });
    const snapshotSeq = sequence?.lastSeq ?? 0n;
    const [locations, boxes, items] = await Promise.all([
      tx.boxLocation.findMany({ where: { userId } }),
      tx.box.findMany({ where: { userId } }),
      tx.item.findMany({ where: { userId } }),
    ]);
    await tx.fullResyncSnapshot.create({
      data: { snapshotId, userId, snapshotSeq, createdAt: now, expiresAt, status: 'ACTIVE' },
    });
    const entities: Prisma.FullResyncSnapshotEntityCreateManyInput[] = [];
    for (const [entityType, records] of [
      ['BOX_LOCATION', locations], ['BOX', boxes], ['ITEM', items],
    ] as const) {
      for (const record of records) {
        entities.push({
          snapshotId, entityType, entityId: record.id,
          payload: snapshotPayload(record),
          revision: record.revision, contentHash: record.contentHash,
          syncSeq: record.syncSeq ?? 0n,
          serverUpdatedAt: record.serverUpdatedAt ?? record.updatedAt,
          deleted: record.deletedAt !== null,
        });
      }
    }
    // Bound each insert to avoid oversized SQLite statements.
    for (let i = 0; i < entities.length; i += 100) {
      await tx.fullResyncSnapshotEntity.createMany({ data: entities.slice(i, i + 100) });
    }
    return { snapshotId, snapshotSeq: snapshotSeq.toString(), expiresAt: expiresAt.toISOString(), total: entities.length };
  });
}

export async function readFullResyncPage(
  userId: string, snapshotId: string, offset: number, limit: number,
  client: PrismaClient = prisma, now: Date = new Date(),
) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > FULL_RESYNC_PAGE_LIMIT) {
    throw new FullResyncError('INVALID_PAGINATION', 400);
  }
  const snapshot = await client.fullResyncSnapshot.findFirst({
    where: { snapshotId, userId },
  });
  if (!snapshot) throw new FullResyncError('SNAPSHOT_NOT_FOUND', 404);
  if (snapshot.status !== 'ACTIVE' || snapshot.expiresAt <= now) {
    throw new FullResyncError('SNAPSHOT_EXPIRED', 410);
  }
  const rows = await client.fullResyncSnapshotEntity.findMany({
    where: { snapshotId },
    orderBy: [{ entityType: 'asc' }, { entityId: 'asc' }],
    skip: offset, take: limit + 1,
  });
  const selected = rows.slice(0, limit);
  return {
    snapshotId, snapshotSeq: snapshot.snapshotSeq.toString(),
    entities: selected.map(row => ({
      entityType: row.entityType, entityId: row.entityId,
      payload: row.payload, revision: row.revision.toString(),
      contentHash: row.contentHash, syncSeq: row.syncSeq.toString(),
      serverUpdatedAt: row.serverUpdatedAt.toISOString(), deleted: row.deleted,
    })),
    nextOffset: offset + selected.length, hasMore: rows.length > limit,
  };
}
