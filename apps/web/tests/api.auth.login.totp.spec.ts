// tests/api.auth.login.totp.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';

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

// otplib は spy より mock の方が安定（環境差を減らす）
vi.mock('otplib', () => ({
  authenticator: {
    options: {},
    check: vi.fn(),
  },
}));

import { prisma } from '@/server/prisma';
import {
  getLoginChallenge,
  markLoginChallengeUsed,
  issueSyncToken,
} from '@/server/auth';
import { decryptStr } from '@/server/crypto';
import { authenticator } from 'otplib';

// route は（attempts を跨がないため）テスト内で import する
async function importRoute() {
  const mod = await import('@/app/api/auth/login/totp/route');
  return mod.POST as (req: Request) => Promise<Response>;
}

// --------------------
// helpers
// --------------------

function makeReq(
  body: any,
  headers: Record<string, string> = {},
  // 通常テストはIPを変えてレート制限を汚さない
  ip: string = `10.0.0.${Math.floor(Math.random() * 200) + 1}`,
) {
  return new NextRequest('http://localhost/api/auth/login/totp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const baseUser = {
  id: 'U1',
  totpEnabled: true,
  totpSecretEnc: 'enc-secret',
  recoveryCodes: [] as string[],
};

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(getLoginChallenge).mockResolvedValue({
    id: 'C1',
    userId: 'U1',
    used: false,
    expiresAt: new Date(Date.now() + 100000),
  } as any);

  vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser } as any);
  vi.mocked(prisma.user.update).mockResolvedValue({} as any);

  vi.mocked(decryptStr).mockResolvedValue('SECRET');

  vi.mocked(issueSyncToken).mockResolvedValue({
    token: 'TOKEN',
    expiresAt: new Date('2026-01-01T00:00:00.000Z'),
  } as any);

  vi.mocked(markLoginChallengeUsed).mockResolvedValue(undefined as any);

  vi.mocked(authenticator.check).mockReturnValue(false);
});

// --------------------
// tests
// --------------------

describe('POST /api/auth/login/totp', () => {
  it('T01: Content-Type missing -> 400', async () => {
    const POST = await importRoute();

    const r = new NextRequest('http://x', {
      method: 'POST',
      body: JSON.stringify({ challengeId: 'C1' }),
    });

    const res = await POST(r);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
  });

  it('T02: JSON parse error -> 400', async () => {
    const POST = await importRoute();

    const r = new NextRequest('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const res = await POST(r);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
  });

  it('T03: challengeId missing -> 400', async () => {
    const POST = await importRoute();

    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
  });

  it('T03.5: body is JSON null -> 400 (covers "body ?? {}" fallback branch)', async () => {
    const POST = await importRoute();

    // JSONとして "null" を送ると req.json() は null を返す
    // → destructuring は body ?? {} の {} 側に落ちる（L81 分岐）
    const res = await POST(makeReq(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
  });

  it('T04: expired challenge -> 400', async () => {
    const POST = await importRoute();

    vi.mocked(getLoginChallenge).mockResolvedValueOnce(null as any);

    const res = await POST(makeReq({ challengeId: 'X' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'expired' });
  });

  it('T05: totp not enabled -> 400', async () => {
    const POST = await importRoute();

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'U1',
      totpEnabled: false,
      totpSecretEnc: null,
    } as any);

    const res = await POST(makeReq({ challengeId: 'C1', code: '123456' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'not_enabled' });
  });

  it('T06: invalid totp code -> 400', async () => {
    const POST = await importRoute();

    vi.mocked(authenticator.check).mockReturnValueOnce(false);

    const res = await POST(makeReq({ challengeId: 'C1', code: '000000' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid' });
  });

  it('T07: invalid recovery code -> 400', async () => {
    const POST = await importRoute();

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...baseUser,
      recoveryCodes: ['somehash'],
    } as any);

    const res = await POST(makeReq({ challengeId: 'C1', recoveryCode: 'NG' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid' });
  });

  it('T07.5: recoveryCodes is null -> 400 (covers "(user.recoveryCodes) ?? []" fallback branch)', async () => {
    const POST = await importRoute();

    // recoveryCodes が DB上 null のケース（移行/未設定/不整合など）を想定
    // → list は ?? [] の [] 側に落ちる（L133 分岐）
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...baseUser,
      recoveryCodes: null,
    } as any);

    const res = await POST(
      makeReq({ challengeId: 'C1', recoveryCode: 'NG' }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid' });
  });

  it('T08: success with totp code -> 200', async () => {
    const POST = await importRoute();

    vi.mocked(authenticator.check).mockReturnValueOnce(true);

    const res = await POST(makeReq({ challengeId: 'C1', code: '123456' }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.token).toBe('TOKEN');

    expect(markLoginChallengeUsed).toHaveBeenCalledWith('C1');
    expect(issueSyncToken).toHaveBeenCalledTimes(1);
  });

  it('T09: server error -> 500', async () => {
    const POST = await importRoute();

    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB'));

    const res = await POST(makeReq({ challengeId: 'C1', code: '123456' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'server_error' });
  });

  it('T10: rate limit -> 429 (same user+ip, 6th attempt)', async () => {
    const POST = await importRoute();

    // 失敗を積み上げる（TOTP check false のまま）
    const fixedIp = '203.0.113.10';
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        makeReq({ challengeId: 'C1', code: '000000' }, {}, fixedIp),
      );
      expect(res.status).toBe(400);
    }

    const res6 = await POST(
      makeReq({ challengeId: 'C1', code: '000000' }, {}, fixedIp),
    );
    expect(res6.status).toBe(429);
    expect(await res6.json()).toEqual({ ok: false, error: 'too_many_attempts' });
  });

  it('T11: success with recovery code -> 200 and consumes one recovery code', async () => {
    const POST = await importRoute();

    const rcPlain = 'ABCD1234';
    const h = crypto.createHash('sha256').update(rcPlain).digest('hex');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...baseUser,
      recoveryCodes: [h, 'otherhash'],
    } as any);

    const res = await POST(makeReq({ challengeId: 'C1', recoveryCode: rcPlain }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);

    // recoveryCodes から h が消えた更新が走る
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'U1' },
        data: { recoveryCodes: ['otherhash'] },
      }),
    );
  });

  it('T12: recovery consume update throws -> 500', async () => {
    const POST = await importRoute();

    const rcPlain = 'ABCD1234';
    const h = crypto.createHash('sha256').update(rcPlain).digest('hex');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...baseUser,
      recoveryCodes: [h],
    } as any);

    // recovery 消費 update が例外
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('DB update error'));

    const res = await POST(makeReq({ challengeId: 'C1', recoveryCode: rcPlain }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'server_error' });
  });

  it('T13: markLoginChallengeUsed throws -> 500', async () => {
    const POST = await importRoute();

    vi.mocked(authenticator.check).mockReturnValueOnce(true);
    vi.mocked(markLoginChallengeUsed).mockRejectedValueOnce(new Error('boom'));

    const res = await POST(makeReq({ challengeId: 'C1', code: '123456' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'server_error' });
  });

  it('T14: issueSyncToken throws -> 500', async () => {
    const POST = await importRoute();

    vi.mocked(authenticator.check).mockReturnValueOnce(true);
    vi.mocked(issueSyncToken).mockRejectedValueOnce(new Error('boom'));

    const res = await POST(makeReq({ challengeId: 'C1', code: '123456' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'server_error' });
  });

  it('T15: lastLoginAt update throws -> 500', async () => {
    const POST = await importRoute();

    vi.mocked(authenticator.check).mockReturnValueOnce(true);

    // 1回目の update は lastLoginAt 更新に当たる（実装上、recovery消費が無い前提）
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('boom'));

    const res = await POST(makeReq({ challengeId: 'C1', code: '123456' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'server_error' });
  });

  it('T16: fullwidth totp code is normalized (covers norm6 callback) -> 200', async () => {
    const POST = await importRoute();

    // 全角を入れて norm6 のコールバックを踏む
    vi.mocked(authenticator.check).mockReturnValueOnce(true);

    const res = await POST(makeReq({ challengeId: 'C1', code: '１２３４５６' }));
    expect(res.status).toBe(200);
  });

  it('T17: x-forwarded-for missing -> clientIp falls back to "local" (covers clientIp line)', async () => {
    const POST = await importRoute();

    vi.mocked(authenticator.check).mockReturnValueOnce(true);

    // x-forwarded-for を付けない（＝ clientIp が "local" に落ちる）
    const r = new NextRequest('http://localhost/api/auth/login/totp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId: 'C1', code: '123456' }),
    });

    const res = await POST(r);
    expect(res.status).toBe(200);

    // issueSyncToken の引数 ip が "local" になっていることを確認
    expect(issueSyncToken).toHaveBeenCalledWith(
      'U1',
      expect.objectContaining({ ip: 'local' }),
    );
  });

});
