import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPushV2 } from '@/server/sync-push-v2';
import { listConflictsV2 } from '@/server/sync-conflicts-v2';

let directory: string;
let client: PrismaClient;
const time = '2026-10-24T00:00:00.000Z';
const operation = (id: string, overrides: Record<string, unknown> = {}) => ({
  operationId: id, entityType: 'BOX_LOCATION', entityId: 'loc',
  operation: 'UPSERT', baseRevision: '0', contentHash: 'h1',
  payload: { id: 'loc', name: 'Shelf', note: null, thumbs: [], meta: null,
    createdAt: time, updatedAt: time, deletedAt: null },
  ...overrides,
});

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'hakomokuroku-push-'));
  client = new PrismaClient({
    datasources: { db: { url: 'file:' + join(directory, 'push.db').replace(/\\/g, '/') } },
  });
  await client.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY)');
  await client.$executeRawUnsafe('INSERT INTO "User" ("id") VALUES (\'u1\'), (\'u2\')');
  await client.$executeRawUnsafe('CREATE TABLE "SyncSequence" ("id" TEXT NOT NULL PRIMARY KEY, "lastSeq" BIGINT NOT NULL)');
  await client.$executeRawUnsafe(`CREATE TABLE "BoxLocation" (
    "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "name" TEXT NOT NULL,
    "note" TEXT, "thumbs" TEXT NOT NULL, "meta" TEXT,
    "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME, "serverUpdatedAt" DATETIME,
    "revision" BIGINT NOT NULL DEFAULT 0, "contentHash" TEXT NOT NULL, "syncSeq" BIGINT,
    PRIMARY KEY ("userId", "id")
  )`);
  await client.$executeRawUnsafe(`CREATE TABLE "SyncChangeLog" (
    "syncSeq" BIGINT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
    "revision" BIGINT NOT NULL, "contentHash" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL, "payload" TEXT NOT NULL,
    "serverUpdatedAt" DATETIME NOT NULL
  )`);
  await client.$executeRawUnsafe(`CREATE TABLE "SyncConflict" (
    "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
    "clientBaseRevision" BIGINT NOT NULL, "clientContentHash" TEXT NOT NULL,
    "clientPayload" TEXT NOT NULL, "serverRevisionAtConflict" BIGINT NOT NULL,
    "serverContentHashAtConflict" TEXT NOT NULL, "serverPayloadAtConflict" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    UNIQUE ("userId", "entityType", "entityId")
  )`);
  await client.$executeRawUnsafe(`CREATE TABLE "SyncPushReceipt" (
    "userId" TEXT NOT NULL, "operationId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL, "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "operationId")
  )`);
});

afterAll(async () => {
  if (client) await client.$disconnect();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('v0.8 Push on isolated SQLite', () => {
  it('atomically creates a record, sequence, changelog and receipt', async () => {
    const result = await applyPushV2('u1', operation('11111111-1111-4111-8111-111111111111'), client);
    expect(result).toMatchObject({ status: 'APPLIED', revision: '1', syncSeq: '1' });
    expect((await client.boxLocation.findUniqueOrThrow({
      where: { userId_id: { userId: 'u1', id: 'loc' } },
    })).name).toBe('Shelf');
    expect(await client.syncChangeLog.count()).toBe(1);
    expect(await client.syncPushReceipt.count()).toBe(1);
  });
  it('replays the exact operation without changing revision or sequence', async () => {
    const input = operation('11111111-1111-4111-8111-111111111111');
    expect(await applyPushV2('u1', input, client)).toMatchObject({
      status: 'APPLIED', revision: '1', syncSeq: '1',
    });
    expect(await client.syncChangeLog.count()).toBe(1);
    expect((await client.syncSequence.findUniqueOrThrow({ where: { id: 'global' } })).lastSeq).toBe(1n);
  });
  it('rejects operation ID reuse with different contents', async () => {
    const input = operation('11111111-1111-4111-8111-111111111111', { contentHash: 'changed' });
    await expect(applyPushV2('u1', input, client)).rejects.toThrow('PUSH_OPERATION_ID_REUSED');
    expect(await client.syncChangeLog.count()).toBe(1);
  });
  it('returns and persists a revision conflict without overwriting the record', async () => {
    const input = operation('22222222-2222-4222-8222-222222222222', { contentHash: 'other-hash' });
    const first = await applyPushV2('u1', input, client);
    expect(first).toMatchObject({ status: 'CONFLICT', revision: '1' });
    expect(first.conflictId).toEqual(expect.any(String));
    const saved = await client.syncConflict.findUniqueOrThrow({ where: {
      userId_entityType_entityId: { userId: 'u1', entityType: 'BOX_LOCATION', entityId: 'loc' },
    } });
    expect(saved.id).toBe(first.conflictId);
    expect(saved.clientContentHash).toBe('other-hash');
    expect(saved.serverContentHashAtConflict).toBe('h1');
    expect(saved.clientBaseRevision).toBe(0n);
    expect(saved.serverRevisionAtConflict).toBe(1n);
    expect((saved.serverPayloadAtConflict as { name: string }).name).toBe('Shelf');
    expect(await applyPushV2('u1', input, client)).toEqual(first);
    expect(await client.syncConflict.count()).toBe(1);
    expect((await client.boxLocation.findUniqueOrThrow({
      where: { userId_id: { userId: 'u1', id: 'loc' } },
    })).name).toBe('Shelf');
    expect(await client.syncChangeLog.count()).toBe(1);
  });
  it('updates one unresolved conflict without duplicating its entity identity', async () => {
    const input = operation('66666666-6666-4666-8666-666666666666', {
      contentHash: 'new-intent',
      payload: { ...operation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').payload, name: 'New intent' },
    });
    const result = await applyPushV2('u1', input, client);
    const saved = await client.syncConflict.findUniqueOrThrow({ where: {
      userId_entityType_entityId: { userId: 'u1', entityType: 'BOX_LOCATION', entityId: 'loc' },
    } });
    expect(result.conflictId).toBe(saved.id);
    expect(saved.clientContentHash).toBe('new-intent');
    expect(await client.syncConflict.count()).toBe(1);
    expect(await client.syncChangeLog.count()).toBe(1);
  });
  it('rolls back the conflict receipt when persistence fails', async () => {
    await client.$executeRawUnsafe(`CREATE TRIGGER "conflict_failure"
      BEFORE UPDATE ON "SyncConflict"
      BEGIN SELECT RAISE(ABORT, 'forced conflict failure'); END`);
    const input = operation('77777777-7777-4777-8777-777777777777', {
      contentHash: 'failed-intent',
    });
    try {
      await expect(applyPushV2('u1', input, client)).rejects.toThrow();
      expect(await client.syncPushReceipt.findUnique({
        where: { userId_operationId: { userId: 'u1', operationId: input.operationId } },
      })).toBeNull();
      expect((await client.syncConflict.findFirstOrThrow({ where: { userId: 'u1' } })).clientContentHash)
        .toBe('new-intent');
    } finally {
      await client.$executeRawUnsafe('DROP TRIGGER "conflict_failure"');
    }
  });
  it('lists only the requesting user conflicts with JSON-safe revision strings', async () => {
    const own = await listConflictsV2('u1', client);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({
      entityType: 'BOX_LOCATION', entityId: 'loc',
      clientBaseRevision: '0', clientContentHash: 'new-intent',
      serverRevisionAtConflict: '1', serverContentHashAtConflict: 'h1',
    });
    expect(typeof own[0].conflictId).toBe('string');
    expect((own[0].clientPayload as { name: string }).name).toBe('New intent');
    expect((own[0].serverPayloadAtConflict as { name: string }).name).toBe('Shelf');
    expect(JSON.stringify(own)).toContain('serverRevisionAtConflict');
    expect(await listConflictsV2('u2', client)).toEqual([]);
  });
  it('preserves the conflict and receipt on an exact replay after another operation', async () => {
    const input = operation('66666666-6666-4666-8666-666666666666', {
      contentHash: 'new-intent',
      payload: { ...operation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').payload, name: 'New intent' },
    });
    const before = await listConflictsV2('u1', client);
    const receipt = await client.syncPushReceipt.findUniqueOrThrow({
      where: { userId_operationId: { userId: 'u1', operationId: input.operationId } },
    });
    expect(await applyPushV2('u1', input, client)).toEqual(receipt.result);
    expect(await listConflictsV2('u1', client)).toEqual(before);
  });
  it('returns UNCHANGED for stale revision with identical content, without writing a new change', async () => {
    const input = operation('55555555-5555-4555-8555-555555555555');
    const result = await applyPushV2('u1', input, client);
    expect(result).toMatchObject({ status: 'UNCHANGED', revision: '1', syncSeq: '1' });
    expect(await applyPushV2('u1', input, client)).toEqual(result);
    expect(await client.syncChangeLog.count()).toBe(1);
    expect((await client.syncSequence.findUniqueOrThrow({ where: { id: 'global' } })).lastSeq).toBe(1n);
  });
  it('updates when the base revision matches', async () => {
    const input = operation('33333333-3333-4333-8333-333333333333', {
      baseRevision: '1', contentHash: 'h2',
      payload: { ...operation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').payload, name: 'New Shelf' },
    });
    expect(await applyPushV2('u1', input, client)).toMatchObject({
      status: 'APPLIED', revision: '2', syncSeq: '2',
    });
    expect((await client.boxLocation.findUniqueOrThrow({
      where: { userId_id: { userId: 'u1', id: 'loc' } },
    })).name).toBe('New Shelf');
  });
  it('rolls back Business and sequence if changelog insertion fails', async () => {
    await client.$executeRawUnsafe(`CREATE TRIGGER "push_log_failure"
      BEFORE INSERT ON "SyncChangeLog"
      BEGIN SELECT RAISE(ABORT, 'forced log failure'); END`);
    const input = operation('44444444-4444-4444-8444-444444444444', {
      baseRevision: '2', contentHash: 'h3',
    });
    await expect(applyPushV2('u1', input, client)).rejects.toThrow();
    expect((await client.boxLocation.findUniqueOrThrow({
      where: { userId_id: { userId: 'u1', id: 'loc' } },
    })).revision).toBe(2n);
    expect((await client.syncSequence.findUniqueOrThrow({ where: { id: 'global' } })).lastSeq).toBe(2n);
    expect(await client.syncPushReceipt.findUnique({
      where: { userId_operationId: { userId: 'u1', operationId: input.operationId } },
    })).toBeNull();
    await client.$executeRawUnsafe('DROP TRIGGER "push_log_failure"');
  });
  it('isolates identical entity and operation identifiers across users', async () => {
    const input = operation('11111111-1111-4111-8111-111111111111');
    const result = await applyPushV2('u2', input, client);
    expect(result).toMatchObject({ status: 'APPLIED', revision: '1', syncSeq: '3' });
    expect(await client.syncChangeLog.count()).toBe(3);
    const foreign = operation('88888888-8888-4888-8888-888888888888', {
      contentHash: 'foreign-intent',
    });
    const conflict = await applyPushV2('u2', foreign, client);
    expect(conflict.status).toBe('CONFLICT');
    expect(await client.syncConflict.count()).toBe(2);
    expect((await client.syncConflict.findUniqueOrThrow({ where: {
      userId_entityType_entityId: { userId: 'u1', entityType: 'BOX_LOCATION', entityId: 'loc' },
    } })).clientContentHash).toBe('new-intent');
  });
});
