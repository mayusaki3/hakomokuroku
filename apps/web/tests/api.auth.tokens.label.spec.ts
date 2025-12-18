import { describe, it, expect, vi, beforeEach } from "vitest";

import { POST } from "@/app/api/auth/tokens/label/route";

// prisma（route の import に合わせる）
vi.mock("@/lib/prisma", () => ({
  prisma: {
    syncToken: {
      updateMany: vi.fn(),
    },
  },
}));
import { prisma } from "@/lib/prisma";

// requireUserId（route の import に合わせる）
vi.mock("@/lib/auth/requireUserId", () => ({
  requireUserId: vi.fn(),
}));
import { requireUserId } from "@/lib/auth/requireUserId";

describe("AUTH_TOKENS_LABEL (POST /api/auth/tokens/label)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(await res.json()).toEqual({ ok: true });
  });

  it("AUTH_TOKENS_LABEL-TC-02: 異常：未ログイン（401）", async () => {
    (requireUserId as any).mockRejectedValue({ status: 401 });

    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "t1", label: "L1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("AUTH_TOKENS_LABEL-TC-03: 異常：Content-Type 不正（400）", async () => {
    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("AUTH_TOKENS_LABEL-TC-04: 異常：JSON パース不正（400）", async () => {
    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("AUTH_TOKENS_LABEL-TC-05: 異常：label 未指定/非string（400）", async () => {
    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "t1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("AUTH_TOKENS_LABEL-TC-06: 異常：token 未指定/非string（400）", async () => {
    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "L1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("AUTH_TOKENS_LABEL-TC-06a: 異常：token が空白のみ（400）", async () => {
    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "   ", label: "L1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
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

  it('AUTH_TOKENS_LABEL-TC-08: 異常：DB 例外（500 相当）', async () => {
    // 重要：401/400 に落ちないように requireUserId は成功させる
    vi.mocked(requireUserId).mockResolvedValueOnce('u1');

    // 重要：updateMany を reject させて route.ts の catch（= 56行付近）を踏む
    vi.mocked(prisma.syncToken.updateMany).mockRejectedValueOnce(new Error('DB error'));

    const req = new Request('http://localhost/api/auth/tokens/label', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 't1', label: 'x' }),
    });

    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it("AUTH_TOKENS_LABEL-TC-09: 異常：Content-Type ヘッダ無し（400）", async () => {
    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      // body を付けない（重要）
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("AUTH_TOKENS_LABEL-TC-10: 異常：requireUserId が status無し例外でも 401", async () => {
    (requireUserId as any).mockRejectedValueOnce(new Error("UNAUTHORIZED"));

    const req = new Request("http://localhost/api/auth/tokens/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "t1", label: "L1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('AUTH_TOKENS_LABEL-TC-11: 異常：updateMany が不正な戻り値なら 500', async () => {
    // requireUserId はログイン済みにする
    vi.mocked(requireUserId).mockResolvedValueOnce('U1');

    // updateMany が壊れた戻り値（count が無い/number でない）
    (prisma.syncToken.updateMany as any).mockResolvedValueOnce({ count: '1' });

    const req = new Request('http://localhost/api/auth/tokens/label', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 't', label: 'dev' }),
    });

    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

});
