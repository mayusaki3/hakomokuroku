// tests/api.auth.login.totp.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/auth/login/totp/route';
import { NextRequest } from 'next/server';

// --------------------
// mocks
// --------------------

vi.mock('@/server/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/server/auth', () => ({
  getLoginChallenge: vi.fn(),
  markLoginChallengeUsed: vi.fn(),
  issueSyncToken: vi.fn(),
}));

vi.mock('@/server/crypto', () => ({
  decryptStr: vi.fn(),
}));

import { prisma } from '@/server/prisma';
import {
  getLoginChallenge,
  markLoginChallengeUsed,
  issueSyncToken,
} from '@/server/auth';
import { decryptStr } from '@/server/crypto';

// --------------------
// helpers
// --------------------

function req(body: any, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/auth/login/totp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const baseUser = {
  id: 'U1',
  totpEnabled: true,
  totpSecretEnc: 'enc-secret',
  recoveryCodes: ['hash1'],
};

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(getLoginChallenge).mockResolvedValue({
    id: 'C1',
    userId: 'U1',
    used: false,
    expiresAt: new Date(Date.now() + 100000),
  });

  vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser as any);
  vi.mocked(decryptStr).mockResolvedValue('SECRET');
  vi.mocked(issueSyncToken).mockResolvedValue({
    token: 'TOKEN',
    expiresAt: new Date(),
  });
});

// --------------------
// tests
// --------------------

describe('POST /api/auth/login/totp', () => {
  it('T01: Content-Type missing -> 400', async () => {
    const r = new NextRequest('http://x', {
      method: 'POST',
      body: JSON.stringify({ challengeId: 'C1' }),
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it('T02: JSON parse error -> 400', async () => {
    const r = new NextRequest('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it('T03: challengeId missing -> 400', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('T04: expired challenge -> 400', async () => {
    vi.mocked(getLoginChallenge).mockResolvedValue(null);
    const res = await POST(req({ challengeId: 'X' }));
    expect(res.status).toBe(400);
  });

  it('T05: totp not enabled -> 400', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'U1',
      totpEnabled: false,
    } as any);

    const res = await POST(req({ challengeId: 'C1', code: '123456' }));
    expect(res.status).toBe(400);
  });

  it('T06: invalid totp code -> 400', async () => {
    vi.spyOn(require('otplib').authenticator, 'check').mockReturnValue(false);

    const res = await POST(req({ challengeId: 'C1', code: '000000' }));
    expect(res.status).toBe(400);
  });

  it('T07: invalid recovery code -> 400', async () => {
    const res = await POST(
      req({ challengeId: 'C1', recoveryCode: 'NG' }),
    );
    expect(res.status).toBe(400);
  });

  it('T08: success with totp code -> 200', async () => {
    vi.spyOn(require('otplib').authenticator, 'check').mockReturnValue(true);

    const res = await POST(req({ challengeId: 'C1', code: '123456' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(markLoginChallengeUsed).toHaveBeenCalledWith('C1');
  });

  it('T09: server error -> 500', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB'));

    const res = await POST(req({ challengeId: 'C1', code: '123456' }));
    expect(res.status).toBe(500);
  });
});
