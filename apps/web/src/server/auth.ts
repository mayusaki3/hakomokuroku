import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/server/prisma';

export const SESSION_COOKIE = 'hk_session';
const SESSION_SECONDS = 30 * 24 * 60 * 60;

export function sessionTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await prisma.authSession.create({
    data: { userId, tokenHash: sessionTokenHash(token), expiresAt },
  });
  return { token, expiresAt };
}

export async function revokeSession(token: string | undefined) {
  if (!token) return;
  await prisma.authSession.updateMany({
    where: { tokenHash: sessionTokenHash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function readSession(_req?: Request): Promise<{
  user: { id: string; userId: string } | null;
}> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return { user: null };
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: sessionTokenHash(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
    return { user: null };
  }
  return { user: { id: session.user.id, userId: session.user.userId } };
}

export const getUser = readSession;

export async function getCurrentUser(_req?: Request) {
  return (await readSession()).user;
}

export async function requireUserId(_req?: Request): Promise<string> {
  const { user } = await readSession();
  if (!user) throw new Error('UNAUTHORIZED');
  return user.id;
}

/**
 * Resolve the currently authenticated session, including its database ID.
 * Never trust a client-supplied session ID for device association.
 */
export async function readAuthenticatedSession(): Promise<{
  id: string;
  userId: string;
} | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: sessionTokenHash(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
    return null;
  }
  return { id: session.id, userId: session.userId };
}
