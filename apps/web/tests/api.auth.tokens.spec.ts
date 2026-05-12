import { describe, it, expect, vi, beforeEach } from "vitest";

// route の import（※プロジェクト内の実パスに合わせる）
import { GET } from "@/app/api/auth/tokens/route";

// 1) prisma モック
vi.mock("@/lib/prisma", () => ({
  prisma: {
    syncToken: {
      findMany: vi.fn(),
    },
  },
}));
import { prisma } from "@/lib/prisma";

// 2) requireUserId モック
vi.mock("@/server/auth", () => ({
  requireUserId: vi.fn(),
}));
import { requireUserId } from "@/server/auth";

describe("AUTH_TOKENS (GET /api/auth/tokens)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * sec_auth_tokens_content_type
   * sec_auth_tokens_require_user
   * sec_auth_tokens_success
   */
  it("AUTH_TOKENS-TC-01: 正常：トークン一覧を返す（200）", async () => {
    (requireUserId as any).mockResolvedValue("U1");
    (prisma.syncToken.findMany as any).mockResolvedValue([{ id: "t1" }, { id: "t2" }]);

    const req = new Request("http://localhost/api/auth/tokens", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([{ id: "t1" }, { id: "t2" }]);
  });

  /**
   * sec_auth_tokens_content_type
   * sec_auth_tokens_require_user
   * sec_auth_tokens_empty
   */
  it("AUTH_TOKENS-TC-02: 正常：0件でも空配列（200）", async () => {
    (requireUserId as any).mockResolvedValue("U1");
    (prisma.syncToken.findMany as any).mockResolvedValue([]);

    const req = new Request("http://localhost/api/auth/tokens", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  /**
   * sec_auth_tokens_unauthorized
   */
  it("AUTH_TOKENS-TC-03: 異常：未ログイン（401）", async () => {
    (requireUserId as any).mockRejectedValue({ status: 401 });

    const req = new Request("http://localhost/api/auth/tokens", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  /**
   * sec_auth_tokens_content_type
   */
  it("AUTH_TOKENS-TC-04: 異常：Content-Type 不正（400）", async () => {
    const req = new Request("http://localhost/api/auth/tokens", {
      method: "GET",
      headers: { "Content-Type": "text/plain" },
    });

    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  /**
   * sec_auth_tokens_db_error
   */
  it("AUTH_TOKENS-TC-05: 異常：DB 例外（500 相当）", async () => {
    (requireUserId as any).mockResolvedValue("U1");
    (prisma.syncToken.findMany as any).mockRejectedValue(new Error("boom"));

    const req = new Request("http://localhost/api/auth/tokens", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  /**
   * sec_auth_tokens_content_type
   */
  it("AUTH_TOKENS-TC-06: 異常：Content-Type ヘッダ無し（400）", async () => {
    const req = new Request("http://localhost/api/auth/tokens", {
      method: "GET",
      // headers なし
    });

    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  /**
   * sec_auth_tokens_forbidden
   */
  it("AUTH_TOKENS-TC-07: 異常：認可エラー（403 など）をそのまま返す", async () => {
    (requireUserId as any).mockRejectedValue({ status: 403 });

    const req = new Request("http://localhost/api/auth/tokens", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  /**
   * sec_auth_tokens_unauthorized
   */
  it("AUTH_TOKENS-TC-08: 異常：requireUserId が status無し例外でも 401（401）", async () => {
    (requireUserId as any).mockRejectedValueOnce(new Error("UNAUTHORIZED"));

    const req = new Request("http://localhost/api/auth/tokens", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
