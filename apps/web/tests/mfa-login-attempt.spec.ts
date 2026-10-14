import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => {
  const rows = new Map<string, { userId: string; failCount: number; lockedUntil: Date | null }>();
  const model = {
    findUnique: vi.fn(async ({ where }: any) => rows.get(where.userId) ?? null),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => {
      const row = rows.get(where.userId);
      if (!row) throw new Error('NOT_FOUND');
      return { ...row };
    }),
    upsert: vi.fn(async ({ where, create }: any) => {
      if (!rows.has(where.userId)) rows.set(where.userId, { userId: create.userId, failCount: 0, lockedUntil: null });
      return { ...rows.get(where.userId)! };
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = rows.get(where.userId)!;
      if (data.failCount?.increment) row.failCount += data.failCount.increment;
      else if (data.failCount !== undefined) row.failCount = data.failCount;
      if ('lockedUntil' in data) row.lockedUntil = data.lockedUntil;
      return { ...row };
    }),
  };
  const prisma = {
    mfaLoginAttempt: model,
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn({ mfaLoginAttempt: model })),
  };
  return { rows, prisma };
});

vi.mock('@/server/prisma', () => ({ prisma: mock.prisma }));

import { isMfaLoginLocked, recordMfaLoginFailure } from '../src/server/mfa-login-attempt';

describe('MFA login attempt state', () => {
  const now = new Date('2026-10-14T10:00:00.000Z');

  beforeEach(() => {
    mock.rows.clear();
    vi.clearAllMocks();
  });

  it('AUTH_LOGIN_TOTP-TC-06/07: four failures then 15-minute lock on fifth', async () => {
    for (let i = 1; i <= 4; i++) {
      expect(await recordMfaLoginFailure('u1', now)).toBe(false);
      expect(mock.rows.get('u1')?.failCount).toBe(i);
    }
    expect(await recordMfaLoginFailure('u1', now)).toBe(true);
    expect(mock.rows.get('u1')?.failCount).toBe(5);
    expect(mock.rows.get('u1')?.lockedUntil?.toISOString()).toBe('2026-10-14T10:15:00.000Z');
  });

  it('AUTH_LOGIN_TOTP-TC-08: locked before deadline, reset on expiry', async () => {
    for (let i = 0; i < 5; i++) await recordMfaLoginFailure('u1', now);
    expect(await isMfaLoginLocked('u1', new Date(now.getTime() + 899_999))).toBe(true);
    expect(await recordMfaLoginFailure('u1', new Date(now.getTime() + 899_999))).toBe(true);
    expect(mock.rows.get('u1')?.failCount).toBe(5);
    expect(await isMfaLoginLocked('u1', new Date(now.getTime() + 900_000))).toBe(false);
    expect(await recordMfaLoginFailure('u1', new Date(now.getTime() + 900_000))).toBe(false);
    expect(mock.rows.get('u1')?.failCount).toBe(1);
    expect(mock.rows.get('u1')?.lockedUntil).toBeNull();
  });

  it('keeps MFA attempt state separate per user', async () => {
    await recordMfaLoginFailure('u1', now);
    await recordMfaLoginFailure('u2', now);
    await recordMfaLoginFailure('u1', now);
    expect(mock.rows.get('u1')?.failCount).toBe(2);
    expect(mock.rows.get('u2')?.failCount).toBe(1);
  });
});
