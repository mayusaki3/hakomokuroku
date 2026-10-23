import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFullResyncSnapshot, readFullResyncPage } from '@/server/full-resync';

// Disposable database with only the tables exercised by this service.
// Does not run migrations and never connects to prisma/dev.db.
const now = new Date('2026-10-23T00:00:00.000Z');
let directory: string;
let client: PrismaClient;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'hakomokuroku-full-resync-'));
  client = new PrismaClient({
    datasources: { db: { url: 'file:' + join(directory, 'snapshot.db').replace(/\\/g, '/') } },
  });
  await client.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY)');
  await client.$executeRawUnsafe('INSERT INTO "User" ("id") VALUES (\'u1\'), (\'u2\')');
  await client.$executeRawUnsafe('CREATE TABLE "SyncSequence" ("id" TEXT NOT NULL PRIMARY KEY, "lastSeq" BIGINT NOT NULL)');
  await client.syncSequence.create({ data: { id: 'global', lastSeq: 12n } });
  const business = `(
    "userId" TEXT NOT NULL, "id" TEXT NOT NULL,
    "name" TEXT NOT NULL, "note" TEXT, "thumbs" TEXT NOT NULL,
    "meta" TEXT, "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME, "serverUpdatedAt" DATETIME, "revision" BIGINT NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL, "syncSeq" BIGINT,
    PRIMARY KEY ("userId", "id")
  )`;
  await client.$executeRawUnsafe('CREATE TABLE "BoxLocation" ' + business);
  await client.$executeRawUnsafe(`CREATE TABLE "Box" (
    "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "code" TEXT NOT NULL,
    "name" TEXT NOT NULL, "locationId" TEXT, "parentBoxId" TEXT,
    "tags" TEXT NOT NULL, "note" TEXT, "thumbs" TEXT NOT NULL,
    "meta" TEXT, "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME, "serverUpdatedAt" DATETIME, "revision" BIGINT NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL, "syncSeq" BIGINT,
    PRIMARY KEY ("userId", "id")
  )`);
  await client.$executeRawUnsafe(`CREATE TABLE "Item" (
    "userId" TEXT NOT NULL, "id" TEXT NOT NULL, "boxId" TEXT,
    "name" TEXT NOT NULL, "tags" TEXT NOT NULL, "note" TEXT, "thumbs" TEXT NOT NULL,
    "meta" TEXT, "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME, "serverUpdatedAt" DATETIME, "revision" BIGINT NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL, "syncSeq" BIGINT,
    PRIMARY KEY ("userId", "id")
  )`);
  await client.$executeRawUnsafe(`CREATE TABLE "FullResyncSnapshot" (
    "snapshotId" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
    "snapshotSeq" BIGINT NOT NULL, "createdAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL, "status" TEXT NOT NULL
  )`);
  await client.$executeRawUnsafe(`CREATE TABLE "FullResyncSnapshotEntity" (
    "snapshotId" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
    "payload" TEXT NOT NULL, "revision" BIGINT NOT NULL,
    "contentHash" TEXT NOT NULL, "syncSeq" BIGINT NOT NULL,
    "serverUpdatedAt" DATETIME NOT NULL, "deleted" BOOLEAN NOT NULL,
    PRIMARY KEY ("snapshotId", "entityType", "entityId"),
    FOREIGN KEY ("snapshotId") REFERENCES "FullResyncSnapshot"("snapshotId") ON DELETE CASCADE
  )`);
  const base = { createdAt: now, updatedAt: now, serverUpdatedAt: now, revision: 1n, contentHash: 'h', syncSeq: 10n };
  await client.boxLocation.create({ data: { ...base, userId: 'u1', id: 'loc', name: 'Shelf', thumbs: [] } });
  await client.box.create({ data: { ...base, userId: 'u1', id: 'box', code: 'BOX', name: 'Original', tags: [], thumbs: [], locationId: 'loc' } });
  await client.item.create({ data: { ...base, userId: 'u1', id: 'item', boxId: 'box', name: 'Book', tags: [], thumbs: [] } });
  await client.box.create({ data: { ...base, userId: 'u2', id: 'private', code: 'PRIVATE', name: 'Other user', tags: [], thumbs: [] } });
});

afterAll(async () => {
  if (client) await client.$disconnect();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('Full Resync on isolated SQLite', () => {
  it('freezes all three entity types and sequence, independent of later changes', async () => {
    const snapshot = await createFullResyncSnapshot('u1', client, now);
    expect(snapshot.snapshotSeq).toBe('12');
    expect(snapshot.total).toBe(3);
    await client.box.update({ where: { userId_id: { userId: 'u1', id: 'box' } }, data: { name: 'Modified' } });
    await client.syncSequence.update({ where: { id: 'global' }, data: { lastSeq: 13n } });
    const first = await readFullResyncPage('u1', snapshot.snapshotId, 0, 2, client, now);
    const second = await readFullResyncPage('u1', snapshot.snapshotId, 2, 2, client, now);
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    const entities = [...first.entities, ...second.entities];
    expect(entities.map(e => e.entityType).sort()).toEqual(['BOX', 'BOX_LOCATION', 'ITEM']);
    expect(new Set(entities.map(e => e.entityType + ':' + e.entityId)).size).toBe(3);
    expect(entities.find(e => e.entityId === 'box')?.payload).toMatchObject({ name: 'Original' });
    expect(first.snapshotSeq).toBe('12');
    expect(second.snapshotSeq).toBe('12');
    expect(entities.some(e => e.entityId === 'private')).toBe(false);
  });
  it('rejects access from another user and expired snapshots', async () => {
    const snapshot = await client.fullResyncSnapshot.findFirstOrThrow({ where: { userId: 'u1' } });
    await expect(readFullResyncPage('u2', snapshot.snapshotId, 0, 10, client, now))
      .rejects.toThrow('SNAPSHOT_NOT_FOUND');
    await expect(readFullResyncPage('u1', snapshot.snapshotId, 0, 10, client, new Date(now.getTime() + 3600001)))
      .rejects.toThrow('SNAPSHOT_EXPIRED');
  });
  it('rolls back snapshot header when entity insertion fails', async () => {
    const before = await client.fullResyncSnapshot.count({ where: { userId: 'u1' } });
    await client.$executeRawUnsafe(`CREATE TRIGGER "snapshot_insert_fail"
      BEFORE INSERT ON "FullResyncSnapshotEntity"
      BEGIN SELECT RAISE(ABORT, 'forced snapshot failure'); END`);
    await expect(createFullResyncSnapshot('u1', client, now)).rejects.toThrow();
    expect(await client.fullResyncSnapshot.count({ where: { userId: 'u1' } })).toBe(before);
    await client.$executeRawUnsafe('DROP TRIGGER "snapshot_insert_fail"');
  });
});
