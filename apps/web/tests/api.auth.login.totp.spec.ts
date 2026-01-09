// tests/api.auth.login.totp.spec.ts
import { describe, expect, it, vi } from "vitest";

// ---- hoisted mocks ----
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/server/prisma", () => ({
  prisma: prismaMock,
}));

// 実装が /lib/prisma を参照する場合にも備えて両方モック（害はない）
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const authMock = vi.hoisted(() => ({
  getLoginChallenge: vi.fn(),
  markLoginChallengeUsed: vi.fn(),
  issueSyncToken: vi.fn(),
}));

vi.mock("@/server/auth", () => authMock);

const cryptoMock = vi.hoisted(() => ({
  decryptStr: vi.fn(),
}));

vi.mock("@/server/crypto", () => cryptoMock);

const otplibMock = vi.hoisted(() => ({
  authenticator: {
    check: vi.fn(),
  },
}));

vi.mock("otplib", () => otplibMock);

// ---- helpers ----
function makeJsonRequest(body: any, extra?: { headers?: Record<string, string> }) {
  return new Request("http://localhost/api/auth/login/totp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(extra?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { __raw: t };
  }
}

describe("POST /api/auth/login/totp", () => {
  it("AUTH_LOGIN_TOTP-TC-01: 正常: challengeId + 正しい code -> 200 ok:true", async () => {
    vi.resetModules();

    authMock.getLoginChallenge.mockResolvedValueOnce({
      id: "C1",
      userId: "U1",
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "U1",
      totpEnabled: true,
      totpSecretEnc: "ENC",
      totpRecoveryCodes: [],
      totpFailCount: 0,
      lockUntil: null,
    });

    cryptoMock.decryptStr.mockResolvedValueOnce("SECRET");
    otplibMock.authenticator.check.mockReturnValueOnce(true);

    authMock.issueSyncToken.mockResolvedValueOnce("TOK1");
    authMock.markLoginChallengeUsed.mockResolvedValueOnce(undefined);

    prismaMock.user.update.mockResolvedValueOnce({ id: "U1" });

    const { POST } = await import("@/app/api/auth/login/totp/route");

    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);

    expect(res.status).toBe(200);

    const json = await readJson(res);
    expect(json).toMatchObject({ ok: true });

    // 成功時にクッキーをセットする実装が多い（あれば確認）
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      expect(setCookie.length).toBeGreaterThan(0);
    }
  });

  it("AUTH_LOGIN_TOTP-TC-02: 必須チェック（challengeId/code 不足） -> 400", async () => {
    vi.resetModules();

    const { POST } = await import("@/app/api/auth/login/totp/route");

    const cases = [{}, { challengeId: "C1" }, { code: "123456" }, { challengeId: "", code: "123456" }, { challengeId: "C1", code: "" }, null];

    for (const body of cases) {
      const res = await POST(makeJsonRequest(body) as any);
      expect(res.status).toBe(400);

      const json = await readJson(res);
      expect(json).toMatchObject({ ok: false });
      if ("reason" in (json as any)) {
        expect((json as any).reason).toBe("INVALID_INPUT");
      }
    }
  });

  it("AUTH_LOGIN_TOTP-TC-03: challenge 不存在 -> 404/400", async () => {
    vi.resetModules();

    authMock.getLoginChallenge.mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/auth/login/totp/route");
    const res = await POST(makeJsonRequest({ challengeId: "NOPE", code: "123456" }) as any);

    expect([400, 404]).toContain(res.status);

    const json = await readJson(res);
    expect(json).toMatchObject({ ok: false });
  });

  it("AUTH_LOGIN_TOTP-TC-04: challenge 期限切れ/使用済み -> 404/400", async () => {
    vi.resetModules();

    authMock.getLoginChallenge.mockResolvedValueOnce({
      id: "C1",
      userId: "U1",
      used: true, // 使用済み
      expiresAt: new Date(Date.now() + 60_000),
    });

    const { POST } = await import("@/app/api/auth/login/totp/route");
    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);

    expect([400, 404]).toContain(res.status);

    const json = await readJson(res);
    expect(json).toMatchObject({ ok: false });
  });

  it("AUTH_LOGIN_TOTP-TC-05: TOTP 検証失敗 -> 400/401/422", async () => {
    vi.resetModules();

    authMock.getLoginChallenge.mockResolvedValueOnce({
      id: "C1",
      userId: "U1",
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "U1",
      totpEnabled: true,
      totpSecretEnc: "ENC",
      totpRecoveryCodes: [],
      totpFailCount: 0,
      lockUntil: null,
    });

    cryptoMock.decryptStr.mockResolvedValueOnce("SECRET");
    otplibMock.authenticator.check.mockReturnValueOnce(false);

    const { POST } = await import("@/app/api/auth/login/totp/route");
    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "000000" }) as any);

    expect([400, 401, 422]).toContain(res.status);

    const json = await readJson(res);
    expect(json).toMatchObject({ ok: false });
  });

  it("AUTH_LOGIN_TOTP-TC-06: ロック中（lockUntil が未来） -> 401/429", async () => {
    vi.resetModules();

    authMock.getLoginChallenge.mockResolvedValueOnce({
      id: "C1",
      userId: "U1",
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "U1",
      totpEnabled: true,
      totpSecretEnc: "ENC",
      totpRecoveryCodes: [],
      totpFailCount: 10,
      lockUntil: new Date(Date.now() + 60_000),
    });

    const { POST } = await import("@/app/api/auth/login/totp/route");
    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);

    expect([401, 429]).toContain(res.status);

    const json = await readJson(res);
    expect(json).toMatchObject({ ok: false });
  });

  it("AUTH_LOGIN_TOTP-TC-07: 内部エラー（DB など） -> 500", async () => {
    vi.resetModules();

    authMock.getLoginChallenge.mockResolvedValueOnce({
      id: "C1",
      userId: "U1",
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });

    prismaMock.user.findUnique.mockImplementationOnce(async () => {
      throw new Error("DB error");
    });

    const { POST } = await import("@/app/api/auth/login/totp/route");
    const res = await POST(makeJsonRequest({ challengeId: "C1", code: "123456" }) as any);

    expect(res.status).toBe(500);

    const json = await readJson(res);
    expect(json).toMatchObject({ ok: false });
  });

  it("AUTH_LOGIN_TOTP-TC-08: Content-Type 不正/無し -> 400", async () => {
    vi.resetModules();

    const { POST } = await import("@/app/api/auth/login/totp/route");

    const req1 = new Request("http://localhost/api/auth/login/totp", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "x",
    });

    const res1 = await POST(req1 as any);
    expect(res1.status).toBe(400);

    const req2 = new Request("http://localhost/api/auth/login/totp", {
      method: "POST",
      // content-type 無し
      body: JSON.stringify({ challengeId: "C1", code: "123456" }),
    });

    const res2 = await POST(req2 as any);
    expect(res2.status).toBe(400);
  });

  it("AUTH_LOGIN_TOTP-TC-09: JSON パース不正 -> 400", async () => {
    vi.resetModules();

    const { POST } = await import("@/app/api/auth/login/totp/route");

    const req = new Request("http://localhost/api/auth/login/totp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{", // broken JSON
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);

    const json = await readJson(res);
    expect(json).toMatchObject({ ok: false });
  });
});
