import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/server/prisma';
import { randomBytes } from 'node:crypto';

// Run ONLY with the dedicated test database. Never use dev.db.
const dbUrl = process.env.DATABASE_URL ?? '';
if (!/^file:.*auth-session-integration\.db(?:\?.*)?$/.test(dbUrl)) {
  throw new Error('AUTH_SESSION_INTEGRATION_DB_REQUIRED: use scripts/test-auth-session-sqlite.ps1');
}

const cookie = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => name === 'hk_session' && cookie.token ? { value: cookie.token } : undefined }),
}));
import { createSession, readSession, revokeSession, sessionTokenHash } from '@/server/auth';

const ids: string[] = [];
async function createUser() {
  const id = 'auth-sqlite-' + randomBytes(8).toString('hex');
  ids.push(id);
  return prisma.user.create({
    data: { id, userId: id, passwordHash: 'integration-test-only' },
  });
}
describe('AuthSession SQLite integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('persists a hashed token and authenticates its owner', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    cookie.token = token;
    const stored = await prisma.authSession.findUnique({ where: { tokenHash: sessionTokenHash(token) } });
    expect(stored?.userId).toBe(user.id);
    expect(stored?.tokenHash).not.toBe(token);
    expect((await readSession()).user?.id).toBe(user.id);
    cookie.token = undefined;
    expect((await readSession()).user).toBeNull();
  });

  it('revocation and expiration are enforced from persisted records', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    cookie.token = token;
    await revokeSession(token);
    expect((await readSession()).user).toBeNull();

    const next = await createSession(user.id);
    cookie.token = next.token;
    await prisma.authSession.update({
      where: { tokenHash: sessionTokenHash(next.token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await readSession()).user).toBeNull();
  });

  it('isolates users and keeps concurrent device sessions independent', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const a1 = await createSession(alice.id);
    const a2 = await createSession(alice.id);
    const b1 = await createSession(bob.id);
    cookie.token = a1.token;
    expect((await readSession()).user?.id).toBe(alice.id);
    cookie.token = b1.token;
    expect((await readSession()).user?.id).toBe(bob.id);
    await revokeSession(a1.token);
    cookie.token = a2.token;
    expect((await readSession()).user?.id).toBe(alice.id);
    cookie.token = a1.token;
    expect((await readSession()).user).toBeNull();
  });
});
