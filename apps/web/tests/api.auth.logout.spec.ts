import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/auth')>();
  return { ...actual, revokeSession: vi.fn() };
});

import { cookies } from 'next/headers';
import { revokeSession, SESSION_COOKIE } from '@/server/auth';
import { POST } from '@/app/api/auth/logout/route';

const mockedCookies = vi.mocked(cookies);
const mockedRevoke = vi.mocked(revokeSession);

beforeEach(() => {
  vi.clearAllMocks();
  mockedCookies.mockReturnValue({ get: vi.fn().mockReturnValue({ value: 'test-session' }) } as any);
  mockedRevoke.mockResolvedValue(undefined);
});

describe('POST /api/auth/logout', () => {
  it('returns 200 and revokes the authenticated session', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockedRevoke).toHaveBeenCalledWith('test-session');
  });

  it('clears the current session cookie', async () => {
    const res = await POST();
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(SESSION_COOKIE + '=');
    expect(cookie).toMatch(/Max-Age=0/i);
  });

  it('is idempotent without a session', async () => {
    mockedCookies.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) } as any);
    expect((await POST()).status).toBe(200);
    expect((await POST()).status).toBe(200);
    expect(mockedRevoke).toHaveBeenCalledTimes(2);
    expect(mockedRevoke).toHaveBeenNthCalledWith(1, undefined);
  });
});
