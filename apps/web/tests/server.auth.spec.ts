import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/server/prisma', () => ({ prisma: { authSession: { findUnique: vi.fn() } } }));

import { cookies } from 'next/headers';
import { prisma } from '@/server/prisma';
import { getUser, requireUserId, sessionTokenHash } from '@/server/auth';

const mockedCookies = vi.mocked(cookies);
const findUnique = vi.mocked(prisma.authSession.findUnique);

function setCookie(value?: string) {
  mockedCookies.mockReturnValue({ get: vi.fn().mockReturnValue(value ? { value } : undefined) } as any);
}

beforeEach(() => {
  vi.resetAllMocks();
  findUnique.mockResolvedValue(null);
});

describe('server/auth utilities', () => {
  it('returns no user without a cookie', async () => {
    setCookie();
    expect(await getUser()).toEqual({ user: null });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('resolves a valid database-backed session', async () => {
    setCookie('test-session');
    findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'U1', userId: 'alice', isActive: true },
    } as any);
    expect(await getUser()).toEqual({ user: { id: 'U1', userId: 'alice' } });
    expect(findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sessionTokenHash('test-session') },
      include: { user: true },
    });
  });

  it('returns the user ID from a valid session', async () => {
    setCookie('test-session');
    findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'U1', userId: 'alice', isActive: true },
    } as any);
    expect(await requireUserId()).toBe('U1');
  });

  it('rejects a missing session', async () => {
    setCookie();
    await expect(requireUserId()).rejects.toThrow('UNAUTHORIZED');
  });

  it('rejects a revoked session', async () => {
    setCookie('revoked-session');
    findUnique.mockResolvedValue({
      revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'U1', userId: 'alice', isActive: true },
    } as any);
    expect(await getUser()).toEqual({ user: null });
  });
});
