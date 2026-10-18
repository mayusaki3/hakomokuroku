/**
 * MFA SQLite transactional ordering stress probe (isolated DB only).
 * node apps/web/tests/probe-mfa-sqlite-transactions.mjs [--repeat=20]
 *
 * Tests: rolled-back insert, concurrent committed writes, abrupt worker death,
 * and atomic success/failure state changes. This does not modify auth routes.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const script = fileURLToPath(import.meta.url);
const sleep = ms => new Promise(done => setTimeout(done, ms));
const client = url => new PrismaClient({ datasources: { db: { url } } });
const insert = (tx, kind) => tx.$queryRawUnsafe(
  'INSERT INTO ProbeEvent (kind) VALUES (?) RETURNING seq', kind);
const count = async (db, kind) => Number((await db.$queryRawUnsafe(
  'SELECT COUNT(*) AS n FROM ProbeEvent WHERE kind = ?', kind))[0].n);

function childRun(url, mode) {
  const child = spawn(process.execPath, [script, '--worker', url, mode], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const finished = new Promise((resolveDone, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolveDone({ code, signal, stdout, stderr }));
  });
  return { child, finished };
}
async function worker(url, mode) {
  const db = client(url);
  try {
    if (mode === 'crash') {
      await db.$transaction(async tx => {
        await insert(tx, 'uncommitted-crash');
        process.stdout.write('READY\n');
        // Parent terminates process while transaction remains open.
        await sleep(30000);
      });
    } else if (mode === 'write') {
      await insert(db, 'concurrent');
      process.stdout.write('DONE\n');
    }
  } finally { await db.$disconnect(); }
}
async function main() {
  const repeatArg = process.argv.find(arg => arg.startsWith('--repeat='));
  const repeat = repeatArg ? Number(repeatArg.slice(9)) : 20;
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 100)
    throw new Error('repeat must be 1..100');
  const directory = await mkdtemp(join(tmpdir(), 'hakomokuroku-mfa-tx-'));
  const url = 'file:' + join(directory, 'probe.db').replaceAll('\\', '/');
  const db = client(url);
  try {
    await db.$executeRawUnsafe(
      'CREATE TABLE ProbeEvent (seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL)');
    await db.$executeRawUnsafe(
      'CREATE TABLE ProbeState (id INTEGER PRIMARY KEY, failures INTEGER NOT NULL, successes INTEGER NOT NULL)');
    await db.$executeRawUnsafe('INSERT INTO ProbeState (id, failures, successes) VALUES (1, 0, 0)');
    // A rolled-back AUTOINCREMENT insert must not survive. A subsequent insert
    // can reuse its seq; only committed rows are admissible ordering evidence.
    let rolledSeq;
    try {
      await db.$transaction(async tx => {
        rolledSeq = Number((await insert(tx, 'rollback'))[0].seq);
        throw new Error('EXPECTED_ROLLBACK');
      });
    } catch (error) {
      if (error.message !== 'EXPECTED_ROLLBACK') throw error;
    }
    const committedSeq = Number((await insert(db, 'committed'))[0].seq);
    const rollbackPass = (await count(db, 'rollback')) === 0 &&
      committedSeq === rolledSeq;

    // Every failure increment and corresponding event must commit together.
    // A forced rollback must preserve both the state and event history.
    try {
      await db.$transaction(async tx => {
        await insert(tx, 'failure-rollback');
        await tx.$executeRawUnsafe(
          'UPDATE ProbeState SET failures = failures + 1 WHERE id = 1');
        throw new Error('EXPECTED_ROLLBACK');
      });
    } catch (error) {
      if (error.message !== 'EXPECTED_ROLLBACK') throw error;
    }
    const atomicRollbackPass = (await count(db, 'failure-rollback')) === 0 &&
      Number((await db.$queryRawUnsafe(
        'SELECT failures FROM ProbeState WHERE id = 1'))[0].failures) === 0;

    let concurrencyPass = true;
    for (let i = 0; i < repeat; i++) {
      const results = await Promise.all([
        childRun(url, 'write').finished, childRun(url, 'write').finished,
      ]);
      if (results.some(result => result.code !== 0)) {
        concurrencyPass = false;
        console.error('Concurrent write failed', { iteration: i + 1, results });
        break;
      }
    }
    concurrencyPass &&= (await count(db, 'concurrent')) === repeat * 2;

    const crash = childRun(url, 'crash');
    let ready = false;
    const deadline = Date.now() + 15000;
    let output = '';
    crash.child.stdout.on('data', chunk => { output += chunk; });
    while (Date.now() < deadline && !output.includes('READY')) await sleep(20);
    ready = output.includes('READY');
    crash.child.kill();
    await crash.finished;
    const crashPass = ready && (await count(db, 'uncommitted-crash')) === 0;
    // The database must remain writable after the abrupt termination.
    await insert(db, 'after-crash');

    // A committed failure, then a committed success, then a failure:
    // event rows remain immutable while consecutive failures reset.
    await db.$transaction(async tx => {
      await insert(tx, 'failure');
      await tx.$executeRawUnsafe('UPDATE ProbeState SET failures = failures + 1 WHERE id = 1');
    });
    await db.$transaction(async tx => {
      await insert(tx, 'success');
      await tx.$executeRawUnsafe(
        'UPDATE ProbeState SET failures = 0, successes = successes + 1 WHERE id = 1');
    });
    await db.$transaction(async tx => {
      await insert(tx, 'failure');
      await tx.$executeRawUnsafe('UPDATE ProbeState SET failures = failures + 1 WHERE id = 1');
    });
    const state = (await db.$queryRawUnsafe('SELECT * FROM ProbeState WHERE id = 1'))[0];
    const atomicOrderingPass = Number(state.failures) === 1 &&
      Number(state.successes) === 1 && (await count(db, 'failure')) === 2;
    const pass = rollbackPass && atomicRollbackPass && concurrencyPass &&
      crashPass && atomicOrderingPass;
    console.log(JSON.stringify({
      pass, repeat, rollbackPass, atomicRollbackPass, concurrencyPass,
      crashPass, atomicOrderingPass, rolledSeq, committedSeq,
      failures: Number(state.failures), persistedFailures: await count(db, 'failure'),
    }));
    if (!pass) process.exitCode = 1;
  } finally {
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
if (process.argv[2] === '--worker') {
  worker(process.argv[3], process.argv[4]).catch(error => {
    console.error(error); process.exitCode = 1;
  });
} else {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
