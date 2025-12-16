import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from '@/app/api/auth/tokens/route'

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    syncToken: {
      findMany: vi.fn(),
    },
  },
}));
import { prisma } from "../../src/lib/prisma";

// TODO(PATH): requireUserId の import パスに合わせる
vi.mock("../../src/lib/auth/requireUserId", () => ({
  requireUserId: vi.fn(),
}));
import { requireUserId } from "../../src/lib/auth/requireUserId";

describe("AUTH_TOKENS (GET /api/auth/tokens)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("AUTH_TOKENS-TC-01: 正常：トークン一覧を返す（200）", async () => {
    (requireUserId as any).mockResolvedValue("U1");
    (prisma.syncToken.findMany as any).mockResolvedValue([
      { id: "t1", label: "L1", createdAt: new Date(), lastUsedAt: null, expiresAt: new Date() },
      { id: "t2", label: "L2", createdAt: new Date(), lastUsedAt: new Date(), expiresAt: new Date() },
    ]);

    const req = new Request("http://localhost/api/auth/tokens", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    for (const row of body) {
      expect(row).toHaveProperty("id");
      expect(row).toHaveProperty("label");
      expect(row).toHaveProperty("createdAt");
      expect(row).toHaveProperty("lastUsedAt");
      expect(row).toHaveProperty("expiresAt");
    }
  });

  it("AUTH_TOKENS-TC-02: 正常：0件でも空配列（200）", async () => {
    (requireUserId as any).mockResolvedValue("U1");
    (prisma.syncToken.findMany as any).mockResolvedValue([]);

    const req = new Request("http://localhost/api/auth/tokens", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("AUTH_TOKENS-TC-03: 異常：未ログイン（401）", async () => {
    (requireUserId as any).mockRejectedValue(Object.assign(new Error("unauthorized"), { status: 401 }));

    const req = new Request("http://localhost/api/auth/tokens", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(401);
  });

  it("AUTH_TOKENS-TC-04: 異常：DB 例外（500 相当）", async () => {
    (requireUserId as any).mockResolvedValue("U1");
    (prisma.syncToken.findMany as any).mockRejectedValue(new Error("boom"));

    const req = new Request("http://localhost/api/auth/tokens", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
