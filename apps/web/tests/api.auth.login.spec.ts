import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../src/app/api/auth/login/route";

type UserRow = {
  id: string;
  userId: string;
  passwordHash: string;
  lockUntil: Date | string | null;
  totpEnabled?: boolean | null;
  isActive?: boolean | null;
};

type TokenRow = {
  id: string;
  token: string;
  label: string | null;
  userId: string;
  createdAt: Date;
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
 * prisma を in-memory にモックする（route.ts 側が import している prisma を置き換える）
 * - ユーザー: users map
 * - トークン: tokens map
 */
const prismaMock = vi.hoisted(() => {
  const users = new Map<string, UserRow>();
  const tokens = new Map<string, TokenRow>();

  users.set("U1", {
    id: "db_u1",
    userId: "U1",
    passwordHash: "HASH_OK",
    lockUntil: null,
    totpEnabled: false,
    isActive: true,
  });

  return {
    __state: { users, tokens },
    prisma: {
      user: {
        findFirst: vi.fn(async (args: any) => {
          const userId = args?.where?.userId;
          if (typeof userId !== "string") return null;
          return users.get(userId) ?? null;
        }),
      },
      token: {
        create: vi.fn(async (args: any) => {
          const t = args?.data;
          const row: TokenRow = {
            id: t.id,
            token: t.token,
            label: t.label ?? null,
            userId: t.userId,
            createdAt: t.createdAt ?? new Date(),
          };
          tokens.set(row.id, row);
          return row;
        }),
      },
    },
  };
});

vi.mock("../src/server/db", () => {
  return { prisma: prismaMock.prisma };
});

vi.mock("../src/server/auth", () => {
  return {
    // login route は set-cookie を返すだけで、ここは直接は使わない想定
  };
});

vi.mock("../src/server/crypto", () => {
  return {
    randomUrlSafe: () => "dummy",
    sha256Hex: (s: string) => `sha_${s}`,
  };
});

vi.mock("../src/server/password", () => {
  return {
    verifyPassword: async (plain: string, hash: string) => {
      if (hash === "HASH_OK" && plain === "P@ssw0rd") return true;
      return false;
    },
  };
});

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    // state 初期化
    prismaMock.__state.users.set("U1", {
      id: "db_u1",
      userId: "U1",
      passwordHash: "HASH_OK",
      lockUntil: null,
      totpEnabled: false,
      isActive: true,
    });
    prismaMock.__state.tokens.clear();
  });

  it("API_AUTH_LOGIN-TC-01: 正常（userId + password が正しい）", async () => {
    const res = await POST(makeJsonRequest({ userId: "U1", password: "P@ssw0rd" }) as any);
    expect(res.status).toBe(200);

    const json = await readJson(res);
    expect(json?.ok).toBe(true);
    expect(typeof json?.token).toBe("string");
  });

  it("API_AUTH_LOGIN-TC-02: userId / password の必須チェック (不足なら 400)", async () => {
    const cases = [
      {},
      { userId: "U1" },
      { password: "x" },
      { userId: "", password: "x" },
      { userId: "U1", password: "" },
      null,
    ];

    for (const body of cases) {
      const res = await POST(makeJsonRequest(body) as any);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json?.ok).toBe(false);
    }
  });

  it("API_AUTH_LOGIN-TC-03: JSON が null -> 400（route.ts のガード想定）", async () => {
    const req = {
      headers: new Headers({ "content-type": "application/json" }),
      async json() {
        return null;
      },
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("API_AUTH_LOGIN-TC-04: userId 不明 (ユーザー未登録) なら 401 相当", async () => {
    const res = await POST(makeJsonRequest({ userId: "NOPE", password: "x" }) as any);
    expect(res.status).toBe(401);
  });

  it("API_AUTH_LOGIN-TC-05: パスワード不一致なら 401", async () => {
    const res = await POST(makeJsonRequest({ userId: "U1", password: "wrong" }) as any);
    expect(res.status).toBe(401);
  });

  it("API_AUTH_LOGIN-TC-07: lockUntil が未来なら 401（or 実装により 429）", async () => {
    const u1 = prismaMock.__state.users.get("U1")!;
    // Date / string どちらでも route 側で判定できる必要がある
    u1.lockUntil = new Date(Date.now() + 60_000).toISOString();

    const res = await POST(makeJsonRequest({ userId: "U1", password: "P@ssw0rd" }) as any);
    expect([401, 429]).toContain(res.status);
  });
});
