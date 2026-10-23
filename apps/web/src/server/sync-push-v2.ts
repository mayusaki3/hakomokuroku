import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/server/prisma';
import {
  checkPushReplay, parsePushOperation, pushFingerprint,
  PushV2Error, type PushV2Operation,
} from '@/server/sync-push-protocol';

type Tx = Prisma.TransactionClient;
const MAX_INT64 = 9223372036854775807n;
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const date = (value: unknown): Date => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new PushV2Error('INVALID_PUSH_PAYLOAD', 400);
  }
  return new Date(value);
};
const optional = (value: unknown): string | null => {
  if (value !== null && typeof value !== 'string') throw new PushV2Error('INVALID_PUSH_PAYLOAD', 400);
  return value;
};
const required = (value: unknown): string => {
  if (typeof value !== 'string') throw new PushV2Error('INVALID_PUSH_PAYLOAD', 400);
  return value;
};
const strings = (value: unknown): string[] => {
  if (!Array.isArray(value) || !value.every(x => typeof x === 'string')) {
    throw new PushV2Error('INVALID_PUSH_PAYLOAD', 400);
  }
  return value;
};
function fields(op: PushV2Operation) {
  const p = op.payload;
  const common = {
    updatedAt: date(p.updatedAt), deletedAt: op.operation === 'DELETE'
      ? new Date() : (p.deletedAt === null ? null : date(p.deletedAt)),
  };
  if (op.entityType === 'BOX') return {
    ...common, code: required(p.code), name: required(p.name),
    locationId: optional(p.locationId), parentBoxId: optional(p.parentBoxId),
    tags: json(strings(p.tags)), note: optional(p.note),
    thumbs: json(strings(p.thumbs)), meta: p.meta == null ? undefined : json(p.meta),
  };
  if (op.entityType === 'ITEM') return {
    ...common, boxId: optional(p.boxId), name: required(p.name),
    tags: json(strings(p.tags)), note: optional(p.note),
    thumbs: json(strings(p.thumbs)), meta: p.meta == null ? undefined : json(p.meta),
  };
  return {
    ...common, name: required(p.name), note: optional(p.note),
    thumbs: json(strings(p.thumbs)), meta: p.meta == null ? undefined : json(p.meta),
  };
}
async function existing(tx: Tx, userId: string, op: PushV2Operation) {
  const where = { userId_id: { userId, id: op.entityId } };
  switch (op.entityType) {
    case 'BOX': return tx.box.findUnique({ where });
    case 'ITEM': return tx.item.findUnique({ where });
    case 'BOX_LOCATION': return tx.boxLocation.findUnique({ where });
  }
}
export interface PushV2Result {
  operationId: string;
  status: 'APPLIED' | 'CONFLICT';
  revision: string;
  syncSeq: string | null;
}
/**
 * Single SQLite write transaction: check receipt first, compare revisions,
 * update Business, append ChangeLog and persist receipt before committing.
 * Never infer success from a lost HTTP response.
 */
export async function applyPushV2(
  userId: string, input: unknown, client: PrismaClient = prisma,
): Promise<PushV2Result> {
  const op = parsePushOperation(input);
  const fingerprint = pushFingerprint(op);
  return client.$transaction(async tx => {
    const receiptKey = { userId_operationId: { userId, operationId: op.operationId } };
    const receipt = await tx.syncPushReceipt.findUnique({ where: receiptKey });
    if (receipt) {
      checkPushReplay(receipt.requestFingerprint, fingerprint);
      return receipt.result as unknown as PushV2Result;
    }
    const remote = await existing(tx, userId, op);
    const remoteRevision = remote?.revision ?? 0n;
    const baseRevision = BigInt(op.baseRevision);
    const conflict = remoteRevision !== baseRevision ||
      (remote === null && baseRevision !== 0n) ||
      (remote?.deletedAt != null);
    let result: PushV2Result;
    if (conflict) {
      result = { operationId: op.operationId, status: 'CONFLICT',
        revision: remoteRevision.toString(), syncSeq: remote?.syncSeq?.toString() ?? null };
    } else {
      if (remoteRevision >= MAX_INT64) throw new PushV2Error('REVISION_OVERFLOW', 409);
      const nextRevision = remoteRevision + 1n;
      const now = new Date();
      const sequence = await tx.syncSequence.upsert({
        where: { id: 'GLOBAL' }, create: { id: 'GLOBAL', lastSeq: 1n },
        update: { lastSeq: { increment: 1n } },
      });
      const seq = sequence.lastSeq;
      const data = fields(op);
      const shared = { ...data, revision: nextRevision,
        contentHash: op.contentHash, syncSeq: seq, serverUpdatedAt: now };
      const where = { userId_id: { userId, id: op.entityId } };
      if (op.entityType === 'BOX') {
        const record = data as ReturnType<typeof fields> & { code: string; name: string; locationId: string | null; parentBoxId: string | null; tags: Prisma.InputJsonValue; note: string | null; thumbs: Prisma.InputJsonValue };
        await tx.box.upsert({ where,
          create: { ...record, userId, id: op.entityId, createdAt: date(op.payload.createdAt),
            revision: nextRevision, contentHash: op.contentHash, syncSeq: seq, serverUpdatedAt: now },
          update: shared });
      } else if (op.entityType === 'ITEM') {
        const record = data as ReturnType<typeof fields> & { boxId: string | null; name: string; tags: Prisma.InputJsonValue; note: string | null; thumbs: Prisma.InputJsonValue };
        await tx.item.upsert({ where,
          create: { ...record, userId, id: op.entityId, createdAt: date(op.payload.createdAt),
            revision: nextRevision, contentHash: op.contentHash, syncSeq: seq, serverUpdatedAt: now },
          update: shared });
      } else {
        const record = data as ReturnType<typeof fields> & { name: string; note: string | null; thumbs: Prisma.InputJsonValue };
        await tx.boxLocation.upsert({ where,
          create: { ...record, userId, id: op.entityId, createdAt: date(op.payload.createdAt),
            revision: nextRevision, contentHash: op.contentHash, syncSeq: seq, serverUpdatedAt: now },
          update: shared });
      }
      await tx.syncChangeLog.create({ data: {
        syncSeq: seq, userId, entityType: op.entityType, entityId: op.entityId,
        revision: nextRevision, contentHash: op.contentHash,
        deleted: op.operation === 'DELETE' || data.deletedAt !== null,
        payload: json({ ...op.payload, deletedAt: data.deletedAt?.toISOString() ?? null,
          updatedAt: data.updatedAt.toISOString() }),
        serverUpdatedAt: now,
      } });
      result = { operationId: op.operationId, status: 'APPLIED',
        revision: nextRevision.toString(), syncSeq: seq.toString() };
    }
    await tx.syncPushReceipt.create({ data: {
      userId, operationId: op.operationId, requestFingerprint: fingerprint,
      result: json(result),
    } });
    return result;
  });
}
