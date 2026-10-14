/**
 * Isolated Prisma/SQLite MFA concurrency probe.
 * Run from repository root:
 *   node apps/web/tests/mfa-login-sqlite.integration.mjs
 * Does not access the configured development database.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const directory = await mkdtemp(join(tmpdir(), 'hakomokuroku-mfa-'));
const databaseFile = join(directory, 'isolated.db');
const databaseUrl = 'file:' + databaseFile.replace(/\\\\/g, '/');
const webRoot = resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname, '..');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function failOnce(userId, now) {
  return prisma.$transaction(async tx => {
    await tx.mfaLoginAttempt.upsert({
      where: { userId },
      create: { userId, failCount: 0 },
      update: {},
    });
    const row = await tx.mfaLoginAttempt.findUniqueOrThrow({ where: { userId } });
    if (row.lockedUntil && row.lockedUntil > now) return true;
    if (row.lockedUntil && row.lockedUntil <= now) {
      await tx.mfaLoginAttempt.update({
        where: { userId }, data: { failCount: 0, lockedUntil: null },
      });
    }
    const updated = await tx.mfaLoginAttempt.update({
      where: { userId }, data: { failCount: { increment: 1 } },
    });
    if (updated.failCount >= 5) {
      await tx.mfaLoginAttempt.update({
        where: { userId }, data: { lockedUntil: new Date(now.getTime() + 900000) },
      });
      return true;
    }
    return false;
  });
}

try {
  // The child process receives ONLY the isolated DATABASE_URL.
  const cmd = process.execPath;
  const prismaCli = resolve(webRoot, 'node_modules/prisma/build/index.js');
  const result = spawnSync(cmd, [prismaCli, 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'], {
    cwd: webRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error('Isolated schema setup failed:\n' + result.stdout + '\n' + result.stderr);
  }

  const userId = 'mfa_concurrency_probe';
  await prisma.user.create({ data: { id: userId, userId, passwordHash: 'probe-only' } });
  const now = new Date('2026-10-14T10:00:00.000Z');

  const sequential = [];
  for (let i = 0; i < 5; i++) sequential.push(await failOnce(userId, now));
  const row = await prisma.mfaLoginAttempt.findUniqueOrThrow({ where: { userId } });
  if (sequential.join(',') !== 'false,false,false,false,true' ||
      row.failCount !== 5 ||
      row.lockedUntil?.getTime() !== now.getTime() + 900000) {
    throw new Error('Sequential lock threshold failed: ' + JSON.stringify(row));
  }
  console.log('PASS: sequential 5 failures and 15-minute lock');

  const afterExpiry = new Date(now.getTime() + 900000);
  if (await failOnce(userId, afterExpiry)) throw new Error('Expiry did not reset lock');
  const reset = await prisma.mfaLoginAttempt.findUniqueOrThrow({ where: { userId } });
  if (reset.failCount !== 1 || reset.lockedUntil !== null) throw new Error('Expiry reset failed');
  console.log('PASS: expiry reset');

  await prisma.mfaLoginAttempt.delete({ where: { userId } });
  const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => failOnce(userId, now)));
  const rejected = outcomes.filter(o => o.status === 'rejected');
  const concurrent = await prisma.mfaLoginAttempt.findUnique({ where: { userId } });
  console.log('Concurrent outcomes:', outcomes.map(o =>
    o.status === 'fulfilled' ? String(o.value) : String(o.reason?.code ?? o.reason?.message ?? o.reason)));
  console.log('Concurrent state:', concurrent?.failCount, concurrent?.lockedUntil?.toISOString() ?? null);
  if (rejected.length || concurrent?.failCount !== 5 ||
      concurrent.lockedUntil?.getTime() !== now.getTime() + 900000) {
    throw new Error('FAIL: concurrent MFA attempts require a concurrency-safe implementation');
  }
  console.log('PASS: concurrent MFA failures');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await rm(directory, { recursive: true, force: true });
}
