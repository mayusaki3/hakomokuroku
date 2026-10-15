import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { authenticator } from "otplib";
import { POST } from "../src/app/api/auth/login/totp/route";

type ChallengeRow = {
  id: string;
  userId: string;
  used: boolean;
  expiresAt: Date | string;
};

type UserRow = {
  id: string;
  userId: string;
  totpEnabled: boolean;
  isActive: boolean;
  totpSecretEnc?: string | null;
  recoveryCodes?: string[] | null;
  totpFailCount?: number | null;
  lockUntil?: Date | string | null;
};

function makeJsonRequest(body: any): Request {
  return {
    headers: new Headers({ "content-type": "application/json" }),
    async json() {
      return body;
    },
  } as any;
}

async function readJson(res: Response): Promise<any> {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

const otplibMock = vi.hoisted(() => {
  return {
    check: vi.fn((code: string, secret: string) => code === "123456" && secret === "SECRET"),
  };
});

const prismaMock = vi.hoisted(() => {
  const users = new Map<string, UserRow>();
  const challenges = new Map<string, ChallengeRow>();
  const attempts = new Map<string, { userId: string; failCount: number; lockedUntil: Date | null }>();

  const reset = () => {
    users.clear();
    challenges.clear();
    attempts.clear();

    users.set("db_u1", {
      id: "db_u1",
      userId: "U1",
      totpEnabled: true,
      isActive: true,
      totpSecretEnc: "SECRET_ENC",
      recoveryCodes: [],
      totpFailCount: 0,
      lockUntil: null,
    });

    challenges.set("C1", {
      id: "C1",
      userId: "db_u1",
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
  };

  reset();

  return {
    __state: { users, challenges, attempts, reset },
    prisma: {
      $transaction: vi.fn(async (fn: any) => fn(prismaMock.prisma)),
      mfaLoginAttempt: {
        findUnique: vi.fn(async ({ where }: any) => attempts.get(where.userId) ?? null),
        findUniqueOrThrow: vi.fn(async ({ where }: any) => {
          const row = attempts.get(where.userId);
          if (!row) throw new Error("NOT_FOUND");
          return { ...row };
        }),
        upsert: vi.fn(async ({ where, create }: any) => {
          if (!attempts.has(where.userId)) {
            attempts.set(where.userId, { userId: create.userId, failCount: 0, lockedUntil: null });
          }
          return { ...attempts.get(where.userId)! };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = attempts.get(where.userId);
          if (!row) throw new Error("NOT_FOUND");
          if (typeof data.failCount === "number") row.failCount = data.failCount;
          else if (data.failCount?.increment) row.failCount += data.failCount.increment;
          if ("lockedUntil" in data) row.lockedUntil = data.lockedUntil;
          return { ...row };
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          const row = attempts.get(where.userId);
          if (!row) return { count: 0 };
          if (typeof data.failCount === "number") row.failCount = data.failCount;
          if ("lockedUntil" in data) row.lockedUntil = data.lockedUntil;
          return { count: 1 };
        }),
      },
      authSession: {
        create: vi.fn(async () => ({ id: "S1" })),
      },
      loginChallenge: {
        updateMany: vi.fn(async (args: any) => {
          const row = challenges.get(args.where.id);
          if (!row || row.used || row.expiresAt <= new Date()) return { count: 0 };
          row.used = true;
          return { count: 1 };
        }),
        findUnique: vi.fn(async (args: any) => {
          const id = args?.where?.id;
          if (typeof id !== "string") return null;
          return challenges.get(id) ?? null;
        }),
        update: vi.fn(async (args: any) => {
          const id = args?.where?.id;
          const row = challenges.get(id);
          if (!row) throw new Error("NOT_FOUND");

          const next = {
            ...row,
            ...(args?.data ?? {}),
          };

          challenges.set(id, next);
          return next;
        }),
      },

      user: {
        findUnique: vi.fn(async (args: any) => {
          const id = args?.where?.id;
          if (typeof id !== "string") return null;
          return users.get(id) ?? null;
        }),

        update: vi.fn(async (args: any) => {
          const id = args?.where?.id;
          const row = users.get(id);
          if (!row) throw new Error("NOT_FOUND");

          const next = {
            ...row,
            ...(args?.data ?? {}),
          };

          users.set(id, next);
          return next;
        }),
      },

      syncToken: {
        create: vi.fn(async () => {
          return {
            id: "T1",
            userId: "db_u1",
            tokenHash: "dummy",
            expiresAt: new Date(Date.now() + 3600_000),
          };
        }),
      },
    },
  };
});

vi.mock("@/server/prisma", () => {
  return { prisma: prismaMock.prisma };
});

vi.mock("@/server/auth", () => ({
  SESSION_COOKIE: "hk_session",
  sessionCookieOptions: () => ({ path: "/", httpOnly: true }),
  sessionTokenHash: (token: string) => crypto.createHash("sha256").update(token).digest("hex"),
  revokeSession: vi.fn(async () => undefined),
}));

vi.mock("@/server/device-login", () => ({
  DEVICE_COOKIE: "hk_device",
  deviceCookieOptions: () => ({ path: "/", httpOnly: true }),
  attachLoginDevice: vi.fn(async () => "device-token"),
}));

vi.mock("@/server/crypto", () => {
  return {
    decryptStr: async () => "SECRET",
    randomUrlSafe: () => "dummy",
    sha256Hex: (s: string) => crypto.createHash("sha256").update(s, "utf-8").digest("hex"),
  };
});

vi.mock("otplib", () => {
  return {
    authenticator: {
      check: otplibMock.check,
    },
  };
});

describe("POST /api/auth/login/totp", () => {
  beforeEach(() => {
    prismaMock.__state.reset();
    otplibMock.check.mockImplementation((code: string, secret: string) => code === "123456" && secret === "SECRET");
    vi.clearAllMocks();
  });

  it("AUTH_LOGIN_TOTP-TC-01: 正常: challengeId + 正しい code -> 200 ok:true", async () => {
    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect(res.status).toBe(200);

    const json = await readJson(res);
    expect(json?.ok).toBe(true);
    expect(res.headers.get("set-cookie")).toContain("hk_session=");
    expect(prismaMock.prisma.authSession.create).toHaveBeenCalledOnce();
  });

  it("AUTH_LOGIN_TOTP-TC-02: 必須チェック（challengeId/code 不足） -> 400", async () => {
    const cases = [{}, { challengeId: "C1" }, { code: "123456" }, null];

    for (const body of cases) {
      const res = await POST(makeJsonRequest(body) as any);
      expect(res.status).toBe(400);
    }
  });

  it("AUTH_LOGIN_TOTP-TC-04: challenge 不存在/期限切れ/使用済み -> 400/404", async () => {
    const r0 = await POST(makeJsonRequest({ challengeId: "NOPE", code: "123456" }) as any);
    expect([400, 404]).toContain(r0.status);

    prismaMock.__state.challenges.set("C1", {
      id: "C1",
      userId: "db_u1",
      used: false,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const rExp = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect([400, 404]).toContain(rExp.status);

    prismaMock.__state.reset();

    const ch = prismaMock.__state.challenges.get("C1")!;
    ch.used = true;

    const rUsed = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect([400, 404]).toContain(rUsed.status);
  });

  it("AUTH_LOGIN_TOTP-TC-05: TOTP 検証失敗 -> 400/401/422", async () => {
    vi.mocked(authenticator.check).mockReturnValueOnce(false);

    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "000000" }) as any);
    expect(res.status).toBe(400);
    expect(prismaMock.__state.attempts.get("db_u1")?.failCount).toBe(1);
  });

  it("AUTH_LOGIN_TOTP-TC-07: 5回目の失敗で429、以後ロック中は拒否", async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await POST(makeJsonRequest({ challengeId: "C1", code: "000000" }) as any);
      expect(res.status).toBe(i === 5 ? 429 : 400);
    }
    const attempt = prismaMock.__state.attempts.get("db_u1")!;
    expect(attempt.failCount).toBe(5);
    expect(attempt.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    const blocked = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect(blocked.status).toBe(429);
    expect(prismaMock.prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("AUTH_LOGIN_TOTP-TC-11: MFA成功時のみログイン失敗回数をリセット", async () => {
    prismaMock.__state.attempts.set("db_u1", {
      userId: "db_u1", failCount: 3, lockedUntil: null,
    });
    const user = prismaMock.__state.users.get("db_u1")!;
    user.totpFailCount = 2;
    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect(res.status).toBe(200);
    expect(prismaMock.__state.attempts.get("db_u1")?.failCount).toBe(0);
    expect(prismaMock.__state.users.get("db_u1")?.totpFailCount).toBe(2);
  });

  it("AUTH_LOGIN_TOTP-TC-09: リカバリーコードは一度だけ使用可能", async () => {
    const recoveryCode = "RECOVERY-ONE";
    const hash = crypto.createHash("sha256").update(recoveryCode).digest("hex");
    prismaMock.__state.users.get("db_u1")!.recoveryCodes = [hash];
    const first = await POST(makeJsonRequest({ challengeId: "C1", recoveryCode }) as any);
    expect(first.status).toBe(200);
    expect(prismaMock.__state.users.get("db_u1")?.recoveryCodes).toEqual([]);
    prismaMock.__state.challenges.set("C2", {
      id: "C2", userId: "db_u1", used: false, expiresAt: new Date(Date.now() + 60000),
    });
    const second = await POST(makeJsonRequest({ challengeId: "C2", recoveryCode }) as any);
    expect(second.status).toBe(400);
    expect(prismaMock.__state.attempts.get("db_u1")?.failCount).toBe(1);
  });

  it("AUTH_LOGIN_TOTP-TC-13: ユーザーAのロックはユーザーBに影響しない", async () => {
    prismaMock.__state.users.set("db_u2", {
      id: "db_u2", userId: "U2", totpEnabled: true, isActive: true,
      totpSecretEnc: "SECRET_ENC", recoveryCodes: [], totpFailCount: 0, lockUntil: null,
    });
    prismaMock.__state.challenges.set("C2", {
      id: "C2", userId: "db_u2", used: false, expiresAt: new Date(Date.now() + 60000),
    });
    for (let i = 0; i < 5; i++) {
      await POST(makeJsonRequest({ challengeId: "C1", code: "000000" }) as any);
    }
    expect(prismaMock.__state.attempts.get("db_u1")?.failCount).toBe(5);
    const blocked = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect(blocked.status).toBe(429);
    const other = await POST(makeJsonRequest({ challengeId: "C2", code: "123456" }) as any);
    expect(other.status).toBe(200);
    expect(prismaMock.__state.attempts.has("db_u2")).toBe(false);
    expect(prismaMock.__state.attempts.get("db_u1")?.failCount).toBe(5);
  });

  it("AUTH_LOGIN_TOTP-TC-10: 並列5件の失敗はすべて加算される", async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () =>
      POST(makeJsonRequest({ challengeId: "C1", code: "000000" }) as any)));
    expect(responses.map(res => res.status).sort()).toEqual([400, 400, 400, 400, 429]);
    expect(prismaMock.__state.attempts.get("db_u1")?.failCount).toBe(5);
    expect(prismaMock.__state.attempts.get("db_u1")?.lockedUntil).toBeInstanceOf(Date);
    expect(prismaMock.prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("AUTH_LOGIN_TOTP-IMPL-01: ロック中（lockUntil が未来） -> 401/429", async () => {
    const u1 = prismaMock.__state.users.get("db_u1")!;
    u1.lockUntil = new Date(Date.now() + 60_000);

    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect(res.status).toBe(401);
  });

  it("AUTH_LOGIN_TOTP-IMPL-02: 内部例外 -> 500", async () => {
    (prismaMock.prisma.loginChallenge.findUnique as any).mockRejectedValueOnce(new Error("DB"));

    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect(res.status).toBe(500);
  });
});
