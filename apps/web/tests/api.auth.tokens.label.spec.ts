import { describe, it, expect, vi, beforeEach } from "vitest";

// TODO(PATH)
import { POST } from "../../src/app/api/auth/tokens/label/route";

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    syncToken: {
      updateMany: vi.fn(),
    },
  },
}));
import { prisma } from "../../src/lib/prisma";

vi.mock("../../src/lib/auth/requireUserId", () => ({
  requireUserId: vi.fn(),
}));
import { requireUserId } from "../../src/lib/auth/requireUserId";

describe("AUTH_TOKENS_LABEL (POST /api/auth/tokens/label)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("AUTH_TOKENS_LABEL-TC-01: 正常：body.token 指定でラベル更新（200）", async () => {
    (requireUserId as any).mockResolvedValue("U1");
    (prisma.syncToken.updateMany as any).mockResolvedValue({ count: 1 });

    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "t1", label: "L1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("AUTH_TOKENS_LABEL-TC-02: 異常：未ログイン（401）", async () => {
    (requireUserId as any).mockRejectedValue(Object.assign(new Error("unauthorized"), { status: 401 }));

    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "t1", label: "L1" }),
    });
    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(401);
  });

  it("AUTH_TOKENS_LABEL-TC-03: 異常：Content-Type 不正（400）", async () => {
    (requireUserId as any).mockResolvedValue("U1");

    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("AUTH_TOKENS_LABEL-TC-04: 異常：JSON パース不正（400）", async () => {
    (requireUserId as any).mockResolvedValue("U1");

    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("AUTH_TOKENS_LABEL-TC-05: 異常：label 未指定/非string（400）", async () => {
    (requireUserId as any).mockResolvedValue("U1");

    const cases = [
      {},
      { token: "t1" },
      { token: "t1", label: 123 },
    ];
    for (const c of cases) {
      const req = new Request("http://localhost/api/auth/tokens/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    }
  });

  it("AUTH_TOKENS_LABEL-TC-06: 異常：token 未指定/非string（400）", async () => {
    (requireUserId as any).mockResolvedValue("U1");

    const cases = [
      { label: "L1" },
      { token: 123, label: "L1" },
    ];
    for (const c of cases) {
      const req = new Request("http://localhost/api/auth/tokens/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    }
  });

  it("AUTH_TOKENS_LABEL-TC-07: 異常：対象トークンなし（404）", async () => {
    (requireUserId as any).mockResolvedValue("U1");
    (prisma.syncToken.updateMany as any).mockResolvedValue({ count: 0 });

    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "t1", label: "L1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("AUTH_TOKENS_LABEL-TC-08: 異常：DB 例外（500 相当）", async () => {
    (requireUserId as any).mockResolvedValue("U1");
    (prisma.syncToken.updateMany as any).mockRejectedValue(new Error("boom"));

    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "t1", label: "L1" }),
    });

    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
