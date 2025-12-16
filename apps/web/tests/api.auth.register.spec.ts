import { describe, it, expect, vi, beforeEach } from "vitest";

// TODO(PATH): 実際の route.ts へのパスに合わせる
import { POST } from "../../src/app/api/auth/register/route";

// TODO(PATH): prisma の import パスに合わせる
vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// TODO(PATH): route.ts 側が prisma をどう import しているかに合わせて調整
import { prisma } from "../../src/lib/prisma";

describe("AUTH_REGISTER (POST /api/auth/register)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("AUTH_REGISTER-TC-01: 正常：新規ユーザー登録（200）", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({ userId: "u1" });

    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", password: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const arg = (prisma.user.create as any).mock.calls[0][0];
    expect(arg.data.userId).toBe("u1");
    expect(typeof arg.data.passwordHash).toBe("string");
    expect(arg.data.passwordHash).not.toBe("p1");
  });

  it("AUTH_REGISTER-TC-02: 異常：Content-Type 不正（400）", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "bad_request" });
  });

  it("AUTH_REGISTER-TC-03: 異常：JSON パース不正（400）", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 壊れた JSON
      body: "{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("AUTH_REGISTER-TC-04: 異常：userId 未指定/空/非string（400）", async () => {
    const cases = [
      {},
      { userId: "", password: "p" },
      { userId: 123, password: "p" },
    ];

    for (const c of cases) {
      const req = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    }
  });

  it("AUTH_REGISTER-TC-05: 異常：password 未指定/空/非string（400）", async () => {
    const cases = [
      { userId: "u", passwordorei: "p" },
      { userId: "u", password: "" },
      { userId: "u", password: 123 },
    ];

    for (const c of cases) {
      const req = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    }
  });

  it("AUTH_REGISTER-TC-06: 異常：既に登録済み（409）", async () => {
    (prisma.user.findFirst as any).mockResolvedValue({ userId: "u1" });

    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", password: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "already_exists" });

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("AUTH_REGISTER-TC-07: 異常：DB 例外（500 相当）", async () => {
    (prisma.user.findFirst as any).mockRejectedValue(new Error("boom"));

    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", password: "p1" }),
    });

    // Next.js の既定応答に委ねる想定なので status=500 相当だけ見る
    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
