import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revoke: vi.fn(),
  get: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ get: mocks.get }) }));
vi.mock('@/server/auth', () => ({
  SESSION_COOKIE: 'hk_session',
  sessionCookieOptions: () => ({ httpOnly: true, sameSite: 'lax', path: '/' }),
  revokeSession: mocks.revoke,
}));
import { POST } from '@/app/api/auth/logout/route';

describe('Logout retains device registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockReturnValue({ value: 'session-token' });
    mocks.revoke.mockResolvedValue(undefined);
  });

  it('revokes session and clears only the session cookie', async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith('hk_session');
    expect(mocks.revoke).toHaveBeenCalledWith('session-token');
    const header = response.headers.get('set-cookie') ?? '';
    expect(header).toContain('hk_session=');
    expect(header).toContain('Max-Age=0');
    expect(header).not.toContain('hk_device=');
  });

  it('returns 500 when revocation fails without clearing device cookie', async () => {
    mocks.revoke.mockRejectedValueOnce(new Error('test-only failure'));
    const response = await POST();
    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
