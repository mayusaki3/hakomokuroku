import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = {
  id: string;
  userId: string;
  passwordHash: string;
  lockUntil: Date | string | null;
  totpEnabled?: boolean | null;
  isActive?: boolean | null;
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

const prismaMock = vi.hoisted(() => {
  const users = new Map<string, UserRow>();

  const reset = () => {
    users.clear();
    users.set("U1", {
      id: "db_u1",
      userId: "U1",
      passwordHash: "HASH_OK",
      lockUntil: null,
      totpEnabled: false,
      isActive: true,
    });
  };

  reset();

  const findUser = (where: any): UserRow | null => {
    const key = where?.userId ?? where?.id;
    if (typeof key !== "string") return null;

    if (users.has(key)) return users.get(key)!;

    for (const user of users.values()) {
      if (user.id === key) return user;
    }
    return null;
  };

  return {
    __state: { users, reset },
    prisma: {
      user: {
        findUnique: vi.fn(async (args: any) => findUser(args?.where)),
        findFirst: vi.fn(async (args: any) => findUser(args?.where)),
      },
    },
  };
});

vi.mock("@/server/prisma", () => {
  return { prisma: prismaMock.prisma };
});

vi.mock("@/server/auth", () => {
  return {
    verifyPassword: (plain: string, hash: string) => {
      return plain === "P@ssw0rd" && hash === "HASH_OK";
    },
  };
});

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    prismaMock.__state.reset();
    vi.clearAllMocks();
  });

  it("API_AUTH_LOGIN-TC-01: 正常（userId + password が正しい）", async () => {
    const { POST } = await import("../src/app/api/auth/login/route");

    const res = await POST(makeJsonRequest({ userId: "U1", password: "P@ssw0rd" }) as any);
    expect(res.status).toBe(200);

    const json = await readJson(res);
    expect(json?.ok).toBe(true);
    expect(res.headers.get("set-cookie")).toContain("sid=");
  });

  it("API_AUTH_LOGIN-TC-02: userId / password の必須チェック (不足なら 400)", async () => {
    const { POST } = await import("../src/app/api/auth/login/route");

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
    const { POST } = await import("../src/app/api/auth/login/route");

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
    const { POST } = await import("../src/app/api/auth/login/route");

    const res = await POST(makeJsonRequest({ userId: "NOPE", password: "x" }) as any);
    expect(res.status).toBe(401);
  });

  it("API_AUTH_LOGIN-TC-05: パスワード不一致なら 401", async () => {
    const { POST } = await import("../src/app/api/auth/login/route");

    const res = await POST(makeJsonRequest({ userId: "U1", password: "wrong" }) as any);
    expect(res.status).toBe(401);
  });

  it("API_AUTH_LOGIN-TC-07: lockUntil が未来なら 401", async () => {
    const { POST } = await import("../src/app/api/auth/login/route");

    const u1 = prismaMock.__state.users.get("U1")!;
    u1.lockUntil = new Date(Date.now() + 60_000);

    const res = await POST(makeJsonRequest({ userId: "U1", password: "P@ssw0rd" }) as any);
    expect(res.status).toBe(401);
  });
});
