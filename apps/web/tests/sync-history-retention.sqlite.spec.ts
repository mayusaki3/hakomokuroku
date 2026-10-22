import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneSyncHistory } from '@/server/sync-history-retention';

// A disposable SQLite database in the OS temp directory. Never use dev.db.
// Minimal tables mirror the three Prisma models exercised by retention.
const now = new Date('2026-10-22T00:00:00.000Z');
const old = new Date('2026-06-01T00:00:00.000Z');
const recent = new Date('2026-10-01T00:00:00.000Z');
let directory: string;
let client: PrismaClient;

async function add(userId: string, seq: bigint, date: Date) {
  await client.syncChangeLog.create({
    data: {
      userId, syncSeq: seq, entityType: 'BOX', entityId: 'box-' + seq,
      revision: 1n, contentHash: 'hash', deleted: false,
      payload: { id: 'box-' + seq }, serverUpdatedAt: date,
    },
  });
}

async function sequences(userId: string) {
  const rows = await client.syncChangeLog.findMany({
    where: { userId }, select: { syncSeq: true }, orderBy: { syncSeq: 'asc' },
  });
  return rows.map(row => row.syncSeq);
}

async function boundary(userId: string) {
  return (await client.syncHistoryBoundary.findUnique({ where: { userId } }))?.minValidCursor ?? null;
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'hakomokuroku-retention-'));
  const filename = join(directory, 'retention.db').replace(/\\/g, '/');
  client = new PrismaClient({ datasources: { db: { url: 'file:' + filename } } });
  await client.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await client.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY)');
  await client.$executeRawUnsafe(`CREATE TABLE "SyncChangeLog" (
    "syncSeq" BIGINT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "revision" BIGINT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL,
    "payload" TEXT NOT NULL,
    "serverUpdatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`);
  await client.$executeRawUnsafe(`CREATE TABLE "SyncHistoryBoundary" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "minValidCursor" BIGINT NOT NULL DEFAULT 0,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`);
  await client.$executeRawUnsafe('INSERT INTO "User" ("id") VALUES (\'u1\'), (\'u2\')');
});

afterAll(async () => {
  if (client) await client.$disconnect();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('sync history retention on isolated SQLite', () => {
  it('prunes only an expired prefix, preserving out-of-order timestamps and other users', async () => {
    await add('u1', 1n, old);
    await add('u2', 2n, old);
    await add('u1', 3n, recent);
    await add('u1', 4n, old); // expired but AFTER an unexpired row
    await add('u2', 5n, recent);

    expect(await pruneSyncHistory(now, client)).toMatchObject({ removed: 2, advancedUsers: 2 });
    expect(await sequences('u1')).toEqual([3n, 4n]);
    expect(await sequences('u2')).toEqual([5n]);
    expect(await boundary('u1')).toBe(1n);
    expect(await boundary('u2')).toBe(2n);
  });

  it('is idempotent and does not move boundaries backwards', async () => {
    expect(await pruneSyncHistory(now, client)).toMatchObject({ removed: 0, advancedUsers: 0 });
    expect(await boundary('u1')).toBe(1n);
    expect(await boundary('u2')).toBe(2n);
  });

  it('rolls back boundary changes when deletion fails', async () => {
    await add('u1', 6n, old);
    // The earlier unexpired seq=3 protects seq=6. Use a separate user
    // with no retained rows to exercise a transaction that must roll back.
    await client.$executeRawUnsafe('INSERT INTO "User" ("id") VALUES (\'rollback\')');
    await add('rollback', 7n, old);
    await client.$executeRawUnsafe(`CREATE TRIGGER "retention_fail_delete"
      BEFORE DELETE ON "SyncChangeLog"
      WHEN OLD."userId" = 'rollback'
      BEGIN SELECT RAISE(ABORT, 'forced retention delete failure'); END`);
    await expect(pruneSyncHistory(now, client)).rejects.toThrow();
    expect(await sequences('rollback')).toEqual([7n]);
    expect(await boundary('rollback')).toBeNull();
    await client.$executeRawUnsafe('DROP TRIGGER "retention_fail_delete"');
    expect(await pruneSyncHistory(now, client)).toMatchObject({ removed: 1, advancedUsers: 1 });
    expect(await boundary('rollback')).toBe(7n);
    expect(await sequences('u1')).toEqual([3n, 4n, 6n]);
  });
});
