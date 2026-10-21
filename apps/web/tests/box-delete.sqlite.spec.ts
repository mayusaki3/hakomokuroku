import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

const url = process.env.DATABASE_URL ?? '';
if (url !== 'file:./box-delete-integration.db') {
  throw new Error('BOX_DELETE_INTEGRATION_DB_REQUIRED: use scripts/test-box-delete-sqlite.ps1');
}
vi.mock('@/server/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } }) };
});
import { BoxDeleteError, deleteBoxTransaction } from '@/server/box-delete-transaction';
import { businessContentHash } from '@/server/business-content-hash';

const prisma = new PrismaClient({ datasources: { db: { url } } });
const suffix = randomBytes(6).toString('hex');
const alice = 'box-delete-a-' + suffix;
const bob = 'box-delete-b-' + suffix;
let counter = 0;
const id = (label: string) => label + '-' + suffix + '-' + ++counter;
const now = () => new Date();

async function box(userId: string, data: { id?: string; parentBoxId?: string | null; locationId?: string | null; deletedAt?: Date | null; name?: string } = {}) {
  const boxId = data.id ?? id('box');
  return prisma.box.create({
    data: {
      userId, id: boxId, code: boxId, name: data.name ?? boxId,
      parentBoxId: data.parentBoxId ?? null, locationId: data.locationId ?? null,
      tags: [], thumbs: [], createdAt: now(), updatedAt: now(),
      deletedAt: data.deletedAt ?? null, contentHash: 'initial',
    },
  });
}
async function item(userId: string, boxId: string | null, data: { deletedAt?: Date | null; name?: string } = {}) {
  const itemId = id('item');
  return prisma.item.create({
    data: {
      userId, id: itemId, boxId, name: data.name ?? itemId,
      tags: [], thumbs: [], createdAt: now(), updatedAt: now(),
      deletedAt: data.deletedAt ?? null, contentHash: 'initial',
    },
  });
}
const key = (userId: string, recordId: string) => ({ userId_id: { userId, id: recordId } });

describe('Box delete SQLite transaction', () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (const userId of [alice, bob]) {
      await prisma.user.create({ data: { id: userId, userId, passwordHash: 'test-only' } });
    }
  });
  afterAll(async () => {
    await prisma.syncChangeLog.deleteMany({ where: { userId: { in: [alice, bob] } } });
    await prisma.item.deleteMany({ where: { userId: { in: [alice, bob] } } });
    // Break self-referencing Box nesting before physically deleting test fixtures.
    await prisma.box.updateMany({
      where: { userId: { in: [alice, bob] } },
      data: { parentBoxId: null },
    });
    await prisma.box.deleteMany({ where: { userId: { in: [alice, bob] } } });
    await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } });
    await prisma.$disconnect();
  });

  it('BOX_DELETE-TC-01..07: tombstones parent, detaches active direct children, preserves descendants and metadata', async () => {
    const parent = await box(alice);
    const child = await box(alice, { parentBoxId: parent.id });
    const grandchild = await box(alice, { parentBoxId: child.id });
    const activeItem = await item(alice, parent.id);
    const deletedItem = await item(alice, parent.id, { deletedAt: now() });
    const deletedChild = await box(alice, { parentBoxId: parent.id, deletedAt: now() });
    const before = await prisma.syncSequence.findUnique({ where: { id: 'GLOBAL' } });
    const result = await deleteBoxTransaction(alice, parent.id, 0n);
    expect(result).toEqual({ deletedBoxId: parent.id, movedItems: 1, movedBoxes: 1 });

    const [p, c, g, i, oldItem, oldChild] = await Promise.all([
      prisma.box.findUniqueOrThrow({ where: key(alice, parent.id) }),
      prisma.box.findUniqueOrThrow({ where: key(alice, child.id) }),
      prisma.box.findUniqueOrThrow({ where: key(alice, grandchild.id) }),
      prisma.item.findUniqueOrThrow({ where: key(alice, activeItem.id) }),
      prisma.item.findUniqueOrThrow({ where: key(alice, deletedItem.id) }),
      prisma.box.findUniqueOrThrow({ where: key(alice, deletedChild.id) }),
    ]);
    expect(p.deletedAt).not.toBeNull();
    expect(i.boxId).toBeNull();
    expect(c.parentBoxId).toBeNull();
    expect(c.locationId).toBeNull();
    expect(g.parentBoxId).toBe(child.id);
    expect(oldItem.boxId).toBe(parent.id);
    expect(oldChild.parentBoxId).toBe(parent.id);
    const changes = await prisma.syncChangeLog.findMany({
      where: { userId: alice, entityId: { in: [parent.id, child.id, activeItem.id] } },
      orderBy: { syncSeq: 'asc' },
    });
    expect(changes).toHaveLength(3);
    expect(changes.map((v) => v.entityId)).toEqual([activeItem.id, child.id, parent.id]);
    expect(changes.map((v) => v.deleted)).toEqual([false, false, true]);
    const previous = before?.lastSeq ?? 0n;
    expect(changes[0].syncSeq).toBeGreaterThan(previous);
    for (let n = 1; n < changes.length; n++) {
      expect(changes[n].syncSeq).toBe(changes[n - 1].syncSeq + 1n);
    }
    for (const row of [p, c, i]) {
      expect(row.revision).toBe(1n);
      expect(row.syncSeq).not.toBeNull();
      expect(row.serverUpdatedAt).not.toBeNull();
      expect(row.contentHash).toBe(businessContentHash(row === i ? 'ITEM' : 'BOX', row));
      expect(changes.find((v) => v.entityId === row.id)?.contentHash).toBe(row.contentHash);
    }
    expect((changes[0].payload as { boxId: string | null }).boxId).toBeNull();
  });

  it('BOX_DELETE-TC-08: rolls back all changes when a child has invalid business data', async () => {
    const parent = await box(alice);
    const first = await item(alice, parent.id);
    const invalid = await item(alice, parent.id, { name: '   ' });
    const seqBefore = (await prisma.syncSequence.findUnique({ where: { id: 'GLOBAL' } }))?.lastSeq;
    await expect(deleteBoxTransaction(alice, parent.id, 0n)).rejects.toThrow('Required business string is empty');
    expect((await prisma.item.findUniqueOrThrow({ where: key(alice, first.id) })).boxId).toBe(parent.id);
    expect((await prisma.item.findUniqueOrThrow({ where: key(alice, invalid.id) })).boxId).toBe(parent.id);
    expect((await prisma.box.findUniqueOrThrow({ where: key(alice, parent.id) })).deletedAt).toBeNull();
    expect((await prisma.syncSequence.findUnique({ where: { id: 'GLOBAL' } }))?.lastSeq).toBe(seqBefore);
    expect(await prisma.syncChangeLog.count({ where: { userId: alice, entityId: { in: [parent.id, first.id, invalid.id] } } })).toBe(0);
  });

  it('BOX_DELETE-TC-09: never modifies a different user', async () => {
    const target = await box(bob);
    const inside = await item(bob, target.id);
    await expect(deleteBoxTransaction(alice, target.id, 0n)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await prisma.box.findUniqueOrThrow({ where: key(bob, target.id) })).deletedAt).toBeNull();
    expect((await prisma.item.findUniqueOrThrow({ where: key(bob, inside.id) })).boxId).toBe(target.id);
  });

  it('BOX_DELETE-TC-10: rejects stale revision and duplicate deletion', async () => {
    const target = await box(alice);
    await expect(deleteBoxTransaction(alice, target.id, 1n)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await deleteBoxTransaction(alice, target.id, 0n);
    await expect(deleteBoxTransaction(alice, target.id, 0n)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await prisma.syncChangeLog.count({ where: { userId: alice, entityId: target.id } })).toBe(1);
  });

  it('BOX_DELETE-TC-11..12: empty box is tombstoned with one log; unassigned stays null', async () => {
    const target = await box(alice);
    const result = await deleteBoxTransaction(alice, target.id, 0n);
    expect(result.movedItems).toBe(0);
    expect(result.movedBoxes).toBe(0);
    const changes = await prisma.syncChangeLog.findMany({ where: { userId: alice, entityId: target.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0].deleted).toBe(true);
  });
});
