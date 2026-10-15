/**
 * Run TOTP API integration tests against a disposable SQLite database.
 * Usage (repository root): node apps/web/tests/run-mfa-api-sqlite.mjs
 * Never opens the application's development database.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repeatArg = process.argv.find(arg => arg.startsWith('--repeat='));
const repeat = repeatArg ? Number(repeatArg.slice('--repeat='.length)) : 1;
if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 100) {
  throw new Error('--repeat must be an integer from 1 to 100');
}

const directory = await mkdtemp(join(tmpdir(), 'hakomokuroku-mfa-api-'));
const databaseUrl = 'file:' + join(directory, 'isolated.db').split('\\').join('/');
const webRoot = resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname, '..');
const env = { ...process.env, DATABASE_URL: databaseUrl, MFA_ISOLATED_TEST: '1' };
function run(cli, args) {
  const result = spawnSync(process.execPath, [resolve(webRoot, cli), ...args], {
    cwd: webRoot, env, encoding: 'utf8', stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed (exit ${result.status}): ${cli}`);
}
try {
  run('node_modules/prisma/build/index.js', [
    'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate',
  ]);
  for (let i = 1; i <= repeat; i++) {
    console.log(`MFA SQLite API test iteration ${i}/${repeat}`);
    run('node_modules/vitest/vitest.mjs', [
      'run', 'tests/api.auth.login.totp.sqlite.spec.ts',
    ]);
    if (i < repeat) {
      run('node_modules/prisma/build/index.js', [
        'db', 'push', '--force-reset', '--schema', 'prisma/schema.prisma', '--skip-generate',
      ]);
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
