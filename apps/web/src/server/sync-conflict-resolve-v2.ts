import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/server/prisma';

export type KeepServerResult =
  | { status: 'RESOLVED'; resolution: 'KEEP_SERVER'; revision: string;
      contentHash: string; syncSeq: string | null; payload: unknown }
  | { status: 'CONFLICT_STALE'; revision: string;
      contentHash: string; payload: unknown };

export class ConflictResolveError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

const snapshot = (record: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(record ?? {}, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value)) as Prisma.InputJsonValue;

export async function keepServerV2(
  userId: string, conflictId: string, expectedServerRevision: string,
  client: PrismaClient = prisma,
): Promise<KeepServerResult> {
  if (!/^(0|[1-9][0-9]*)$/.test(expectedServerRevision) ||
      BigInt(expectedServerRevision) > 9223372036854775807n) {
    throw new ConflictResolveError('INVALID_EXPECTED_REVISION', 400);
  }
  return client.$transaction(async tx => {
    const conflict = await tx.syncConflict.findFirst({ where: { id: conflictId, userId } });
    if (!conflict) throw new ConflictResolveError('CONFLICT_NOT_FOUND', 404);
    const where = { userId_id: { userId, id: conflict.entityId } };
    const remote = conflict.entityType === 'BOX'
      ? await tx.box.findUnique({ where })
      : conflict.entityType === 'ITEM'
        ? await tx.item.findUnique({ where })
        : await tx.boxLocation.findUnique({ where });
    const revision = remote?.revision ?? 0n;
    const contentHash = remote?.contentHash ?? '';
    const payload = snapshot(remote);
    if (revision !== BigInt(expectedServerRevision)) {
      await tx.syncConflict.update({
        where: { id: conflict.id },
        data: {
          serverRevisionAtConflict: revision,
          serverContentHashAtConflict: contentHash,
          serverPayloadAtConflict: payload,
        },
      });
      return { status: 'CONFLICT_STALE', revision: revision.toString(),
        contentHash, payload };
    }
    await tx.syncConflict.delete({ where: { id: conflict.id } });
    return { status: 'RESOLVED', resolution: 'KEEP_SERVER',
      revision: revision.toString(), contentHash,
      syncSeq: remote?.syncSeq?.toString() ?? null, payload };
  });
}
