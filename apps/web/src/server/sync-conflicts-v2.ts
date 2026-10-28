import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/server/prisma';

export interface ConflictV2Record {
  conflictId: string;
  entityType: 'BOX' | 'ITEM' | 'BOX_LOCATION';
  entityId: string;
  clientBaseRevision: string;
  clientContentHash: string;
  clientPayload: unknown;
  serverRevisionAtConflict: string;
  serverContentHashAtConflict: string;
  serverPayloadAtConflict: unknown;
  createdAt: string;
  updatedAt: string;
}

/** List unresolved conflicts belonging to the authenticated database User.id. */
export async function listConflictsV2(
  userId: string, client: PrismaClient = prisma,
): Promise<ConflictV2Record[]> {
  const rows = await client.syncConflict.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map(row => ({
    conflictId: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    clientBaseRevision: row.clientBaseRevision.toString(),
    clientContentHash: row.clientContentHash,
    clientPayload: row.clientPayload,
    serverRevisionAtConflict: row.serverRevisionAtConflict.toString(),
    serverContentHashAtConflict: row.serverContentHashAtConflict,
    serverPayloadAtConflict: row.serverPayloadAtConflict,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
