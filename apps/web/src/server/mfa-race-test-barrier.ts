// Diagnostic-only hook for isolated two-process MFA HTTP tests.
// Disabled unless the server receives an explicit test secret and matching header.
// Never expose MFA_RACE_TEST_SECRET or MFA_RACE_TEST_DIR in a deployed service.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

export async function waitForMfaRaceTestBarrier(request: Request, challengeId: string): Promise<void> {
  const secret = process.env['MFA_RACE_TEST_SECRET'];
  const directory = process.env['MFA_RACE_TEST_DIR'];
  if (!secret || !directory) return;
  const supplied = request.headers.get('x-mfa-race-test-secret');
  if (!supplied) return;
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length ||
      !timingSafeEqual(expectedBytes, suppliedBytes)) return;
  if (!/^[a-zA-Z0-9_-]+$/.test(challengeId)) throw new Error('Invalid test challenge ID');
  const group = request.headers.get('x-mfa-race-test-group');
  if (!group || !/^[a-zA-Z0-9_-]+$/.test(group)) throw new Error('Invalid test barrier group');
  const barrier = join(directory, group);
  await mkdir(barrier, { recursive: true });
  await writeFile(join(barrier, challengeId + '.ready'), '', { flag: 'wx' });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const files = await readdir(barrier);
    if (files.filter(file => file.endsWith('.ready')).length === 2) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('MFA test barrier timeout');
}
