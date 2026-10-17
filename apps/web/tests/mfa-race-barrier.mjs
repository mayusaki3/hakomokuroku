/**
 * Cross-process test barrier. Never import this module from production code.
 * Usage: node apps/web/tests/mfa-race-barrier.mjs --self-test
 *
 * The self-test forks two independent Node.js processes and ensures both have
 * reached the barrier before either is released.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function rendezvous(directory, participant, expected = 2, timeoutMs = 10000) {
  if (!/^[a-zA-Z0-9_-]+$/.test(participant)) throw new Error('Invalid participant');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, participant + '.ready'), '', { flag: 'wx' });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const files = await readdir(directory);
    if (files.filter(name => name.endsWith('.ready')).length >= expected) return;
    await delay(20);
  }
  throw new Error('Barrier timeout: ' + participant);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv.includes('--worker')) {
  const index = process.argv.indexOf('--worker');
  const directory = process.argv[index + 1];
  const participant = process.argv[index + 2];
  await rendezvous(directory, participant);
  process.stdout.write(participant + ':released\n');
} else if (process.argv.includes('--self-test')) {
  const directory = await mkdtemp(join(tmpdir(), 'mfa-barrier-'));
  const children = [];
  try {
    const run = participant => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [thisFile, '--worker', directory, participant], {
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
      children.push(child);
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(output)));
    });
    const outputs = await Promise.all([run('server-a'), run('server-b')]);
    const files = await readdir(directory);
    if (files.filter(name => name.endsWith('.ready')).length !== 2 ||
        !outputs.includes('server-a:released') || !outputs.includes('server-b:released')) {
      throw new Error('Barrier invariant failed');
    }
    console.log(JSON.stringify({ pass: true, participants: outputs }));
  } finally {
    for (const child of children) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
}
