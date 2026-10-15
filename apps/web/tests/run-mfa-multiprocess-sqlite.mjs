/**
 * Isolated cross-process SQLite contention probe for MFA failure accounting.
 * Run from repository root: node apps/web/tests/run-mfa-multiprocess-sqlite.mjs
 * Each worker owns a separate Node.js process and PrismaClient.
 * This tests the DB update algorithm, not the HTTP/TOTP route.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const self = fileURLToPath(import.meta.url);
const cwd = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(join(cwd, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const workerCount = 5;
const repeatArg = process.argv.find(arg => arg.startsWith('--repeat='));
const repeat = repeatArg ? Number(repeatArg.slice(9)) : 1;
if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 100) {
  throw new Error('--repeat must be an integer between 1 and 100');
}
if (process.argv[2] === '--worker') {
  if (process.env.MFA_MULTIPROCESS_ISOLATED !== '1' ||
      !process.env.DATABASE_URL?.includes('hakomokuroku-mfa-multiprocess-')) {
    throw new Error('Refusing to run worker outside isolated MFA DB');
  }
  const prisma = new PrismaClient();
  const id = process.argv[3];
  process.stdin.resume();
  process.stdin.once('data', async () => {
    try {
      const locked = await prisma.$transaction(async tx => {
        await tx.mfaLoginAttempt.upsert({
          where: { userId: id }, create: { userId: id, failCount: 0 }, update: {},
        });
        const current = await tx.mfaLoginAttempt.findUniqueOrThrow({ where: { userId: id } });
        if (current.lockedUntil && current.lockedUntil > new Date()) return true;
        const updated = await tx.mfaLoginAttempt.update({
          where: { userId: id }, data: { failCount: { increment: 1 } },
        });
        if (updated.failCount >= 5) {
          await tx.mfaLoginAttempt.update({
            where: { userId: id },
            data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
          });
          return true;
        }
        return false;
      });
      process.stdout.write(JSON.stringify({ ok: true, locked }) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({
        ok: false, code: error?.code ?? null, message: String(error?.message ?? error),
      }) + '\n');
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  });
} else {
  const directory = await mkdtemp(join(tmpdir(), 'hakomokuroku-mfa-multiprocess-'));
  const databaseUrl = 'file:' + join(directory, 'isolated.db').replaceAll('\\', '/');
  const env = { ...process.env, DATABASE_URL: databaseUrl, MFA_MULTIPROCESS_ISOLATED: '1' };
  const runPrisma = args => {
    const result = spawnSync(process.execPath, [
      resolve(cwd, 'node_modules/prisma/build/index.js'), ...args,
    ], { cwd, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Prisma setup failed: ' + result.status);
  };
  let db;
  try {
    runPrisma(['db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate']);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    for (let iteration = 1; iteration <= repeat; iteration++) {
      const id = 'mfa_multiprocess_' + iteration;
      await db.user.create({ data: {
        id, userId: id, passwordHash: 'isolated-test', isActive: true,
        totpEnabled: true, totpSecretEnc: 'mock-encrypted',
      } });
      const workers = Array.from({ length: workerCount }, () => {
        const child = spawn(process.execPath, [self, '--worker', id], {
          cwd, env, stdio: ['pipe', 'pipe', 'pipe'],
        });
        let output = '', errors = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { errors += chunk; });
        const done = new Promise(resolveDone => {
          child.on('error', error => resolveDone({ code: -1, output, errors: String(error) }));
          child.on('close', code => resolveDone({ code, output, errors }));
        });
        return { child, done };
      });
      // All workers start at once after their processes have spawned.
      for (const worker of workers) worker.child.stdin.end('start\n');
      const results = await Promise.all(workers.map(worker => worker.done));
      const parsed = results.map(result => {
        try { return JSON.parse(result.output.trim().split('\n').at(-1)); }
        catch { return { ok: false, message: result.errors || result.output }; }
      });
      const attempt = await db.mfaLoginAttempt.findUnique({ where: { userId: id } });
      const success = parsed.filter(result => result.ok);
      const failed = parsed.filter(result => !result.ok);
      const pass = success.length === 5 && failed.length === 0 &&
        attempt?.failCount === 5 && attempt.lockedUntil > new Date() &&
        success.filter(result => result.locked).length === 1;
      console.log(JSON.stringify({
        iteration, pass, successes: success.length, failures: failed,
        failCount: attempt?.failCount ?? null,
        lockedUntil: attempt?.lockedUntil?.toISOString() ?? null,
      }));
      if (!pass) { process.exitCode = 1; break; }
    }
  } finally {
    if (db) await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
