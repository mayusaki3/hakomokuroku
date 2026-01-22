import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
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
  totpSecret?: string | null;
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

/**
 * route.ts が import している prisma/challenge/user を in-memory で差し替える
 */
const prismaMock = vi.hoisted(() => {
  const users = new Map<string, UserRow>();
  const challenges = new Map<string, ChallengeRow>();

  users.set("db_u1", {
    id: "db_u1",
    userId: "U1",
    totpEnabled: true,
    totpSecret: "SECRET_ENC",
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

  return {
    __state: { users, challenges },
    prisma: {
      totpChallenge: {
        findUnique: vi.fn(async (args: any) => {
          const id = args?.where?.id;
          if (typeof id !== "string") return null;
          return challenges.get(id) ?? null;
        }),
        update: vi.fn(async (args: any) => {
          const id = args?.where?.id;
          const data = args?.data;
          const row = challenges.get(id);
          if (!row) throw new Error("NOT_FOUND");
          const next = { ...row, ...data };
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
          const data = args?.data;
          const row = users.get(id);
          if (!row) throw new Error("NOT_FOUND");
          const next = { ...row, ...data };
          users.set(id, next);
          return next;
        }),
      },
      token: {
        create: vi.fn(async () => {
          return { id: "T1", token: "dummy", userId: "db_u1", createdAt: new Date() };
        }),
      },
    },
  };
});

vi.mock("../src/server/db", () => {
  return { prisma: prismaMock.prisma };
});

vi.mock("../src/server/totp", () => {
  return {
    verifyTotpCode: async () => true,
    verifyRecoveryCode: async () => true,
  };
});

vi.mock("../src/server/crypto", () => {
  return {
    randomUrlSafe: () => "dummy",
    sha256Hex: (s: string) => crypto.createHash("sha256").update(s, "utf-8").digest("hex"),
  };
});

describe("POST /api/auth/login/totp", () => {
  beforeEach(() => {
    // reset
    prismaMock.__state.users.set("db_u1", {
      id: "db_u1",
      userId: "U1",
      totpEnabled: true,
      totpSecret: "SECRET_ENC",
      recoveryCodes: [],
      totpFailCount: 0,
      lockUntil: null,
    });
    prismaMock.__state.challenges.set("C1", {
      id: "C1",
      userId: "db_u1",
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  it("AUTH_LOGIN_TOTP-TC-01: 正常: challengeId + 正しい code -> 200 ok:true", async () => {
    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect(res.status).toBe(200);

    const json = await readJson(res);
    expect(json?.ok).toBe(true);
    expect(typeof json?.token).toBe("string");
  });

  it("AUTH_LOGIN_TOTP-TC-02: 必須チェック（challengeId/code 不足） -> 400", async () => {
    const cases = [{}, { challengeId: "C1" }, { code: "123456" }, null];
    for (const body of cases) {
      const res = await POST(makeJsonRequest(body) as any);
      expect(res.status).toBe(400);
    }
  });

  it("AUTH_LOGIN_TOTP-TC-04: challenge 不存在/期限切れ/使用済み -> 400/404（実装差異許容）", async () => {
    // 不存在
    const r0 = await POST(makeJsonRequest({ challengeId: "NOPE", code: "123456" }) as any);
    expect([400, 404]).toContain(r0.status);

    // 期限切れ
    prismaMock.__state.challenges.set("C1", {
      id: "C1",
      userId: "db_u1",
      used: false,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const rExp = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect([400, 404]).toContain(rExp.status);

    // 使用済み
    const ch = prismaMock.__state.challenges.get("C1")!;
    ch.used = true;
    const rUsed = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect([400, 404]).toContain(rUsed.status);
  });

  it("AUTH_LOGIN_TOTP-TC-05: TOTP 検証失敗 -> 400/401/422（実装差異許容）", async () => {
    const totp = await import("../src/server/totp");
    vi.spyOn(totp, "verifyTotpCode").mockResolvedValueOnce(false);

    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "000000" }) as any);
    expect([400, 401, 422]).toContain(res.status);
  });

  it("AUTH_LOGIN_TOTP-IMPL-01: ロック中（lockUntil が未来） -> 401/429（実装差異許容）", async () => {
    const u1 = prismaMock.__state.users.get("db_u1")!;
    u1.lockUntil = new Date(Date.now() + 60_000).toISOString();

    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect([401, 429]).toContain(res.status);
  });

  it("AUTH_LOGIN_TOTP-IMPL-02: 内部例外 -> 500", async () => {
    const db = await import("../src/server/db");
    (db.prisma.totpChallenge.findUnique as any).mockRejectedValueOnce(new Error("DB"));

    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);
    expect(res.status).toBe(500);
  });
});
