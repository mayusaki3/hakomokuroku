import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/auth', () => ({ getUser: vi.fn() }));
vi.mock('@/server/prisma', () => ({ prisma: { userSetting: { findUnique: vi.fn() } } }));

import { GET } from '@/app/api/settings/theme/active/route';
import { prisma } from '@/server/prisma';
import { getUser } from '@/server/auth';

const mockedGetUser = vi.mocked(getUser);
const findUnique = vi.mocked(prisma.userSetting.findUnique);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/settings/theme/active', () => {
  it('returns the built-in system theme without authentication or a DB query', async () => {
    mockedGetUser.mockResolvedValue({ user: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, active: { themeId: 'builtin:system' } });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns the authenticated user setting', async () => {
    mockedGetUser.mockResolvedValue({ user: { id: 'U1', userId: 'alice' } });
    findUnique.mockResolvedValue({ activeTheme: 'T1' } as any);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, active: { themeId: 'T1' } });
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: 'U1' }, select: { activeTheme: true } });
  });

  it('falls back to the built-in theme when no setting exists', async () => {
    mockedGetUser.mockResolvedValue({ user: { id: 'U1', userId: 'alice' } });
    findUnique.mockResolvedValue(null);
    const res = await GET();
    expect(await res.json()).toEqual({ ok: true, active: { themeId: 'builtin:system' } });
  });

  it('returns 500 on database failure', async () => {
    mockedGetUser.mockResolvedValue({ user: { id: 'U1', userId: 'alice' } });
    findUnique.mockRejectedValue(new Error('db error'));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'db error' });
  });
});
