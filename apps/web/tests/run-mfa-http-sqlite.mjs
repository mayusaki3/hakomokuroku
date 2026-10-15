/**
 * Real HTTP regression probe for simultaneous recovery-code redemption.
 * Uses an isolated SQLite DB and a local Next.js dev server; never dev.db.
 * Usage: node apps/web/tests/run-mfa-http-sqlite.mjs [--repeat=20]
 */
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const repeatText = process.argv.find(arg => arg.startsWith('--repeat='));
const repeat = repeatText ? Number(repeatText.slice(9)) : 1;
if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 100) {
  throw new Error('--repeat must be an integer between 1 and 100');
}
const directory = await mkdtemp(join(tmpdir(), 'hakomokuroku-mfa-http-'));
const url = 'file:' + join(directory, 'isolated.db').replaceAll('\\', '/');
const env = {
  ...process.env, DATABASE_URL: url,
  TOTP_SECRET_KEY: randomBytes(32).toString('base64'),
  NODE_ENV: 'development',
};
const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolvePort(address.port));
  });
});
let child;
let prisma;
let stderr = '';
let stdout = '';
try {
  const setup = spawnSync(process.execPath, [
    resolve(root, 'node_modules/prisma/build/index.js'), 'db', 'push',
    '--schema', 'prisma/schema.prisma', '--skip-generate',
  ], { cwd: root, env, stdio: 'inherit' });
  if (setup.status !== 0) throw new Error('Prisma isolated DB initialization failed');
  prisma = new PrismaClient({ datasources: { db: { url } } });
  child = spawn(process.execPath, [
    resolve(root, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(port),
    '-H', '127.0.0.1',
  ], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.on('data', data => { stdout += data.toString(); stdout = stdout.slice(-8000); });
  child.stderr.on('data', data => { stderr += data.toString(); stderr = stderr.slice(-8000); });
  const endpoint = `http://127.0.0.1:${port}/api/auth/login/totp`;
  const deadline = Date.now() + 90000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Next server exited: ' + stderr + stdout);
    try {
      const response = await fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(2000) });
      if (response.status !== 502 && response.status !== 503) { ready = true; break; }
    } catch { /* startup */ }
    await new Promise(done => setTimeout(done, 500));
  }
  if (!ready) throw new Error('Next server not ready: ' + stderr + stdout);
  for (let i = 1; i <= repeat; i++) {
    const id = `mfa_http_${i}`;
    const code = 'RECOVERY-' + randomBytes(16).toString('hex');
    const hash = createHash('sha256').update(code).digest('hex');
    await prisma.user.create({ data: {
      id, userId: id, passwordHash: 'isolated', isActive: true,
      totpEnabled: true, totpSecretEnc: 'unused-for-recovery',
      recoveryCodes: [hash],
    } });
    const ids = [`http-${i}-1`, `http-${i}-2`];
    for (const challengeId of ids) {
      await prisma.loginChallenge.create({ data: {
        id: challengeId, userId: id, expiresAt: new Date(Date.now() + 600000),
      } });
    }
    const responses = await Promise.all(ids.map(challengeId =>
      fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, recoveryCode: code }),
        signal: AbortSignal.timeout(20000),
      })));
    const statuses = responses.map(response => response.status).sort();
    const sessions = await prisma.authSession.findMany({ where: { userId: id } });
    const challenges = await prisma.loginChallenge.findMany({ where: { userId: id } });
    const updated = await prisma.user.findUniqueOrThrow({ where: { id } });
    const pass = JSON.stringify(statuses) === JSON.stringify([200, 404]) &&
      sessions.length === 1 && sessions[0].revokedAt === null &&
      sessions[0].deviceId !== null &&
      challenges.filter(challenge => challenge.used).length === 1 &&
      Array.isArray(updated.recoveryCodes) && updated.recoveryCodes.length === 0;
    console.log(JSON.stringify({
      iteration: i, pass, statuses, sessions: sessions.length,
      activeSessions: sessions.filter(session => !session.revokedAt).length,
      usedChallenges: challenges.filter(challenge => challenge.used).length,
      recoveryCodesRemaining: updated.recoveryCodes?.length,
    }));
    if (!pass) {
      console.error('Server output:', stdout, stderr);
      process.exitCode = 1;
      break;
    }
  }
} catch (error) {
  console.error(error);
  console.error('Server output:', stdout, stderr);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([
      new Promise(done => child.once('close', done)),
      new Promise(done => setTimeout(done, 5000)),
    ]);
  }
  if (prisma) await prisma.$disconnect();
  await rm(directory, { recursive: true, force: true });
}
