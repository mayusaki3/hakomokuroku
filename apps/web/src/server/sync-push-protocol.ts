import { createHash } from 'node:crypto';
import type { BusinessEntityType } from '@prisma/client';

const MAX_INT64 = 9223372036854775807n;
const TYPES: readonly string[] = ['BOX', 'ITEM', 'BOX_LOCATION'];
const OPERATIONS: readonly string[] = ['UPSERT', 'DELETE'];

export class PushV2Error extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}
export interface PushV2Operation {
  operationId: string;
  entityType: BusinessEntityType;
  entityId: string;
  operation: 'UPSERT' | 'DELETE';
  baseRevision: string;
  contentHash: string;
  payload: Record<string, unknown>;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function parsePushOperation(input: unknown): PushV2Operation {
  if (!object(input) || typeof input.operationId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.operationId) ||
      !TYPES.includes(input.entityType as string) ||
      typeof input.entityId !== 'string' || !input.entityId ||
      input.entityId.length > 256 ||
      !OPERATIONS.includes(input.operation as string) ||
      typeof input.baseRevision !== 'string' ||
      !/^(0|[1-9][0-9]*)$/.test(input.baseRevision) ||
      BigInt(input.baseRevision) > MAX_INT64 ||
      typeof input.contentHash !== 'string' || !input.contentHash ||
      !object(input.payload) || input.payload.id !== input.entityId) {
    throw new PushV2Error('INVALID_PUSH_OPERATION', 400);
  }
  return input as unknown as PushV2Operation;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort()
    .map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
/** Stable across object key insertion order; never trust a client-provided hash. */
export function pushFingerprint(op: PushV2Operation): string {
  return createHash('sha256').update(canonical({
    entityType: op.entityType, entityId: op.entityId, operation: op.operation,
    baseRevision: op.baseRevision, contentHash: op.contentHash, payload: op.payload,
  })).digest('hex');
}
export function checkPushReplay(storedFingerprint: string, incomingFingerprint: string): void {
  if (storedFingerprint !== incomingFingerprint) {
    throw new PushV2Error('PUSH_OPERATION_ID_REUSED', 409);
  }
}
