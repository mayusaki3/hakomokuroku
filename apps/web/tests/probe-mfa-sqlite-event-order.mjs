/**
 * SQLite ordering probe for MFA-RACE-014/015 (not production authentication).
 * Run: node apps/web/tests/probe-mfa-sqlite-event-order.mjs
 * Uses an isolated temporary SQLite database and two independent Node workers.
 * Verifies that committed SQLite AUTOINCREMENT rows establish an ordering
 * without relying on process clocks or HTTP request arrival timestamps.
 */
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const script = fileURLToPath(import.meta.url);
const sleep = ms => new Promise(done => setTimeout(done, ms));

function client(url) {
  return new PrismaClient({ datasources: { db: { url } } });
}
async function append(db, kind, actor) {
  // SQLite's INSERT statement is atomic; RETURNING obtains its DB-assigned
  // ordering value. A separate transaction commits before this resolves.
  const rows = await db.$queryRawUnsafe(
    'INSERT INTO MfaOrderingProbe (kind, actor) VALUES (?, ?) RETURNING seq',
    kind, actor,
  );
  return Number(rows[0].seq);
}
async function worker(url, directory, actor) {
  const db = client(url);
  try {
    const admitted = await append(db, 'admission', actor);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, actor + '.ready'), '', { flag: 'wx' });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if ((await readdir(directory)).filter(name => name.endsWith('.ready')).length === 2) break;
      await sleep(10);
    }
    if ((await readdir(directory)).filter(name => name.endsWith('.ready')).length !== 2)
      throw new Error('Barrier timeout');
    if (actor === 'A') {
      // Both admissions are durable before the first redemption.
      const redeemed = await append(db, 'redemption', actor);
      process.stdout.write(JSON.stringify({ actor, admitted, redeemed }) + '\n');
    } else {
      process.stdout.write(JSON.stringify({ actor, admitted }) + '\n');
    }
  } finally { await db.$disconnect(); }
}
function runWorker(url, directory, actor) {
  return new Promise((resolveWorker, reject) => {
    const child = spawn(process.execPath, [script, '--worker', url, directory, actor],
      { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) reject(new Error(actor + ': ' + stderr));
      else {
        try { resolveWorker(JSON.parse(stdout.trim())); }
        catch (error) { reject(new Error(actor + ': ' + stdout + stderr + error)); }
      }
    });
  });
}

if (process.argv[2] === '--worker') {
  try { await worker(process.argv[3], process.argv[4], process.argv[5]); }
  catch (error) { console.error(error); process.exitCode = 1; }
} else {
  const directory = await mkdtemp(join(tmpdir(), 'hakomokuroku-mfa-order-'));
  const url = 'file:' + join(directory, 'ordering.db').replaceAll('\\', '/');
  const db = client(url);
  try {
    await db.$executeRawUnsafe(
      'CREATE TABLE MfaOrderingProbe (seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, actor TEXT NOT NULL)',
    );
    const barrier = join(directory, randomBytes(8).toString('hex'));
    const [a, b] = await Promise.all([
      runWorker(url, barrier, 'A'), runWorker(url, barrier, 'B'),
    ]);
    const replay = await append(db, 'replay', 'C');
    const events = await db.$queryRawUnsafe(
      'SELECT seq, kind, actor FROM MfaOrderingProbe ORDER BY seq',
    );
    const normalized = events.map(e => ({ ...e, seq: Number(e.seq) }));
    const pass = a.admitted < a.redeemed && b.admitted < a.redeemed &&
      replay > a.redeemed && normalized.length === 4 &&
      normalized.filter(e => e.kind === 'admission').length === 2;
    console.log(JSON.stringify({ pass, events: normalized }));
    if (!pass) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
