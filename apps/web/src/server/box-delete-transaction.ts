import { Prisma, type Box, type Item } from '@prisma/client';
import { prisma } from '@/server/prisma';
import { businessContentHash, canonicalBusinessPayload } from '@/server/business-content-hash';

export class BoxDeleteError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'REVISION_CONFLICT') {
    super(code);
  }
}

type Tx = Prisma.TransactionClient;
type Changed = Box | Item;

async function recordChange(
  tx: Tx,
  userId: string,
  entityType: 'BOX' | 'ITEM',
  row: Changed,
  deleted: boolean,
  now: Date,
): Promise<void> {
  const sync = await tx.syncSequence.upsert({
    where: { id: 'GLOBAL' },
    create: { id: 'GLOBAL', lastSeq: 1n },
    update: { lastSeq: { increment: 1n } },
  });
  const syncSeq = sync.lastSeq;
  const revision = row.revision + 1n;
  const payload = canonicalBusinessPayload(entityType, { ...row, deleted });
  const contentHash = businessContentHash(entityType, { ...row, deleted });
  const key = { userId_id: { userId, id: row.id } };
  if (entityType === 'ITEM') {
    await tx.item.update({
      where: key,
      data: { revision, syncSeq, contentHash, serverUpdatedAt: now },
    });
  } else {
    await tx.box.update({
      where: key,
      data: { revision, syncSeq, contentHash, serverUpdatedAt: now },
    });
  }
  await tx.syncChangeLog.create({
    data: {
      syncSeq, userId, entityType, entityId: row.id, revision, contentHash,
      deleted, payload: payload as Prisma.InputJsonObject, serverUpdatedAt: now,
    },
  });
}

/**
 * Tombstone a Box, detaching only its active direct children.
 * All changes, sequence allocations and changelog writes share one transaction.
 */
export async function deleteBoxTransaction(
  userId: string,
  boxId: string,
  baseRevision: bigint,
): Promise<{ deletedBoxId: string; movedItems: number; movedBoxes: number }> {
  return prisma.$transaction(async (tx) => {
    const key = { userId_id: { userId, id: boxId } };
    const parent = await tx.box.findUnique({ where: key });
    if (!parent || parent.deletedAt) throw new BoxDeleteError('NOT_FOUND');
    if (parent.revision !== baseRevision) throw new BoxDeleteError('REVISION_CONFLICT');

    const [items, boxes] = await Promise.all([
      tx.item.findMany({ where: { userId, boxId, deletedAt: null }, orderBy: { id: 'asc' } }),
      tx.box.findMany({ where: { userId, parentBoxId: boxId, deletedAt: null }, orderBy: { id: 'asc' } }),
    ]);
    const now = new Date();
    for (const item of items) {
      const next = await tx.item.update({
        where: { userId_id: { userId, id: item.id } },
        data: { boxId: null, updatedAt: now },
      });
      await recordChange(tx, userId, 'ITEM', next, false, now);
    }
    for (const box of boxes) {
      const next = await tx.box.update({
        where: { userId_id: { userId, id: box.id } },
        data: { parentBoxId: null, locationId: null, updatedAt: now },
      });
      await recordChange(tx, userId, 'BOX', next, false, now);
    }
    const tombstone = await tx.box.update({
      where: key,
      data: { deletedAt: now, updatedAt: now },
    });
    await recordChange(tx, userId, 'BOX', tombstone, true, now);
    return { deletedBoxId: boxId, movedItems: items.length, movedBoxes: boxes.length };
  });
}
