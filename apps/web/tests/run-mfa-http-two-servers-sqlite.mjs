/**
 * Two independent Next.js HTTP server processes sharing one isolated SQLite DB.
 * Run from repository root: node apps/web/tests/run-mfa-http-two-servers-sqlite.mjs [--repeat=20]
 * Requires an existing production Next.js build: pnpm --dir apps/web build
 * Each server is a distinct process; both use the same built app and test database.
 */
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const repeatText = process.argv.find(arg => arg.startsWith('--repeat='));
const scenarioArg = process.argv.find(arg => arg.startsWith('--scenario='));
const scenario = scenarioArg?.slice('--scenario='.length) ?? 'race';
if (!['race', 'replay', 'barrier', 'invalid-barrier', 'invalid-first', 'valid-first'].includes(scenario))
  throw new Error('Unknown scenario');
const repeat = repeatText ? Number(repeatText.slice(9)) : 1;
if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 100)
  throw new Error('--repeat must be an integer between 1 and 100');

try { await stat(resolve(root, '.next/BUILD_ID')); }
catch { throw new Error('Production build missing. Run: pnpm --dir apps/web build'); }

async function freePort() {
  return new Promise((ok, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => ok(address.port));
    });
  });
}

const directory = await mkdtemp(join(tmpdir(), 'hakomokuroku-mfa-two-http-'));
const databaseUrl = 'file:' + join(directory, 'isolated.db').replaceAll('\\', '/');
const testSecret = randomBytes(32).toString('hex');
const env = {
  ...process.env, DATABASE_URL: databaseUrl,
  MFA_RACE_TEST_SECRET: testSecret,
  MFA_RACE_TEST_DIR: join(directory, 'barriers'),
  TOTP_SECRET_KEY: randomBytes(32).toString('base64'),
  NODE_ENV: 'production',
};
const servers = [];
let db;
try {
  const setup = spawnSync(process.execPath, [
    resolve(root, 'node_modules/prisma/build/index.js'), 'db', 'push',
    '--schema', 'prisma/schema.prisma', '--skip-generate',
  ], { cwd: root, env, stdio: 'inherit' });
  if (setup.error || setup.status !== 0) throw new Error('Isolated Prisma setup failed');
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const ports = [await freePort(), await freePort()];
  if (ports[0] === ports[1]) throw new Error('Port allocation collision');
  for (const port of ports) {
    const child = spawn(process.execPath, [
      resolve(root, 'node_modules/next/dist/bin/next'), 'start',
      '-p', String(port), '-H', '127.0.0.1',
    ], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const entry = { child, port, output: '' };
    const capture = chunk => { entry.output = (entry.output + chunk.toString()).slice(-12000); };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    servers.push(entry);
  }
  const endpoints = servers.map(s => `http://127.0.0.1:${s.port}/api/auth/login/totp`);
  for (const [index, endpoint] of endpoints.entries()) {
    let ready = false;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (servers[index].child.exitCode !== null) break;
      try {
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(1500) });
        if (response.status === 405) { ready = true; break; }
      } catch { /* startup */ }
      await new Promise(done => setTimeout(done, 250));
    }
    if (!ready) throw new Error(`Server ${index + 1} not ready: ${servers[index].output}`);
  }
  for (let iteration = 1; iteration <= repeat; iteration++) {
    const id = `mfa_two_http_${iteration}`;
    const recovery = 'RECOVERY-' + randomBytes(16).toString('hex');
    const recoveryHash = createHash('sha256').update(recovery).digest('hex');
    await db.user.create({ data: {
      id, userId: id, passwordHash: 'isolated', isActive: true,
      totpEnabled: true, totpSecretEnc: 'unused-for-recovery',
      recoveryCodes: [recoveryHash],
    } });
    const challenges = [`two-${iteration}-a`, `two-${iteration}-b`];
    for (const challengeId of challenges) {
      await db.loginChallenge.create({ data: {
        id: challengeId, userId: id, expiresAt: new Date(Date.now() + 600000),
      } });
    }
    const submit = async (endpoint, index, code = recovery) => {
      const barrier = scenario === 'barrier' || scenario === 'invalid-barrier';
      const response = await fetch(endpoint, {
        method: 'POST', headers: {
          'content-type': 'application/json',
          ...(barrier ? {
            'x-mfa-race-test-secret': testSecret,
            'x-mfa-race-test-group': 'iteration-' + iteration,
          } : {}),
        },
        body: JSON.stringify({ challengeId: challenges[index], recoveryCode: code }),
        signal: AbortSignal.timeout(30000),
      });
      return { server: index + 1, status: response.status, body: await response.json() };
    };
    const invalidCode = 'INVALID-' + randomBytes(16).toString('hex');
    const results = scenario === 'replay' || scenario === 'valid-first'
      ? [await submit(endpoints[0], 0), await submit(endpoints[1], 1,
          scenario === 'valid-first' ? invalidCode : recovery)]
      : scenario === 'invalid-first'
        ? [await submit(endpoints[1], 1, invalidCode), await submit(endpoints[0], 0)]
        : await Promise.all(endpoints.map((endpoint, index) =>
          submit(endpoint, index, scenario === 'invalid-barrier' && index === 1
            ? invalidCode : recovery)));
    const statuses = results.map(r => r.status).sort((a, b) => a - b);
    const sessions = await db.authSession.findMany({ where: { userId: id } });
    const used = await db.loginChallenge.count({ where: { userId: id, used: true } });
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    const attempt = await db.mfaLoginAttempt.findUnique({ where: { userId: id } });
    // Durable event assertions are deliberately test-first: the current route
    // does not yet persist these rows, so these checks must fail until integration.
    const events = await db.mfaAuthEvent.findMany({
      where: { userId: id }, orderBy: { id: 'asc' },
    });
    const redemptions = await db.mfaRecoveryRedemption.findMany({
      where: { userId: id },
    });
    const admissions = events.filter(e => e.kind === 'ADMISSION');
    const successes = events.filter(e => e.kind === 'SUCCESS');
    const failures = events.filter(e => e.kind === 'FAILURE');
    const redemptionEvents = events.filter(e => e.kind === 'REDEMPTION');
    const invalidHash = createHash('sha256').update(invalidCode.trim()).digest('hex');
    const redemption = redemptions[0];
    const redeemedEvent = redemptionEvents[0];
    const admissionById = new Map(admissions.map(e => [e.id, e]));
    const durableRedemptionValid = redemptions.length === 1 &&
      redemptionEvents.length === 1 &&
      redemption?.codeHash === recoveryHash &&
      redemption?.eventId === redeemedEvent?.id &&
      redemption?.admissionId === redeemedEvent?.admissionId &&
      admissionById.get(redemption?.admissionId)?.codeHash === recoveryHash &&
      redemption.admissionId < redemption.eventId;
    const expectedFailureEvents = scenario === 'invalid-barrier' ||
      scenario === 'invalid-first' || scenario === 'valid-first' ||
      scenario === 'replay' ? 1 : 0;
    const durableFailuresValid = failures.length === expectedFailureEvents &&
      (expectedFailureEvents === 0 || failures[0].codeHash ===
        (scenario === 'replay' ? recoveryHash : invalidHash));
    const eventOrderValid = admissions.length === 2 &&
      successes.length === 1 &&
      durableRedemptionValid && durableFailuresValid &&
      events.every((event, index) => index === 0 || events[index - 1].id < event.id) &&
      (scenario !== 'barrier' ||
        admissions.every(e => e.id < redeemedEvent.id));
    // A successful login resets the counter; later committed failures increment it.
    // Benign duplicate requests have no FAILURE event.
    const lastSuccess = successes[0]?.id ?? -1;
    const failuresAfterSuccess = failures.filter(e => e.id > lastSuccess).length;
    const durableCounterValid = eventOrderValid &&
      (attempt?.failCount ?? 0) === failuresAfterSuccess;
    const winner = results.filter(r => r.status === 200 && r.body?.ok === true);
    const loser = results.filter(r =>
      (r.status === 404 && r.body?.error === 'not_found') ||
      (r.status === 400 && r.body?.error === 'auth_failed'));
    const expectedFailures = scenario === 'replay' || scenario === 'valid-first' ? 1 : 0;
    // In invalid-first the subsequent successful login resets the counter.
    // In invalid-barrier either transaction may commit last; 0 or 1 is valid
    // until a durable failure-event log can prove that the failure was recorded.
    const pass = eventOrderValid && durableCounterValid &&
      winner.length === 1 && loser.length === 1 &&
      sessions.length === 1 && sessions[0].revokedAt === null &&
      sessions[0].deviceId !== null && used === 1 &&
      Array.isArray(user.recoveryCodes) && user.recoveryCodes.length === 0 &&
      (scenario === 'invalid-barrier'
        ? [0, 1].includes(attempt?.failCount ?? 0)
        : (attempt?.failCount ?? 0) === expectedFailures) &&
      attempt?.lockedUntil == null;
    console.log(JSON.stringify({
      iteration, scenario, pass, statuses, results, sessions: sessions.length,
      activeSessions: sessions.filter(s => !s.revokedAt).length,
      usedChallenges: used, recoveryCodesRemaining: user.recoveryCodes?.length,
      mfaFailCount: attempt?.failCount ?? 0,\n      durableEvents: events.map(e => ({ id: e.id, kind: e.kind, admissionId: e.admissionId })),\n      redemptionCount: redemptions.length, failureEventCount: failures.length,\n      eventOrderValid, durableCounterValid,
      failureCountInterpretation: scenario === 'invalid-barrier'
        ? 'concurrent-reset-order-undetermined' : 'deterministic',
      mfaLockedUntil: attempt?.lockedUntil ?? null,
    }));
    if (!pass) {
      process.exitCode = 1;
      break;
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (process.exitCode) for (const server of servers)
    console.error(`Server ${server.port} output:\n${server.output}`);
  for (const server of servers) server.child.kill();
  await Promise.all(servers.map(server => Promise.race([
    new Promise(done => server.child.once('close', done)),
    new Promise(done => setTimeout(done, 3000)),
  ])));
  if (db) await db.$disconnect();
  await rm(directory, { recursive: true, force: true });
}
