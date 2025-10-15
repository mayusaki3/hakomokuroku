import crypto from "crypto";
import * as argon2 from "argon2";
import { prisma } from "@/server/prisma";

// ---- UserID ----
export async function requireUserId(req: Request): Promise<string> {
  // 1) Authorization: Bearer ...
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  let token = m?.[1]?.trim();

  // 2) Cookie: hk_token=...（UI からの fetch 用）
  if (!token) {
    const cookie = req.headers.get("cookie") || "";
    const m2 = cookie.match(/(?:^|;\s*)hk_token=([^;]+)/);
    if (m2) token = decodeURIComponent(m2[1]);
  }
  if (!token) throw new Response("Unauthorized", { status: 401 });

  // 互換: SYNC_TOKEN
  if (process.env.SYNC_TOKEN && token === process.env.SYNC_TOKEN) {
    const dev = await prisma.user.upsert({
      where: { userId: "dev" }, update: {},
      create: { userId: "dev", passwordHash: "dev" },
      select: { id: true },
    });
    return dev.id;
  }

  const tokenHash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
  const t = await prisma.syncToken.findUnique({ where: { tokenHash } });
  if (!t || t.expiresAt < new Date()) throw new Response("Unauthorized", { status: 401 });
  return t.userId;
}

// ---- Password ----
export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

// ---- SyncToken ----
export async function issueSyncToken(userId: string, ttlDays = 90) {
  const plain = crypto.randomUUID().replace(/-/g, "") + crypto.randomBytes(16).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(plain, "utf8").digest("hex");
  const now = new Date();
  const exp = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  await prisma.syncToken.create({ data: { userId, tokenHash, issuedAt: now, expiresAt: exp } });
  return { token: plain, expiresAt: exp };
}

// ---- Login challenge for TOTP step ----
export async function createLoginChallenge(userId: string, ttlSec = 300) {
  const id = crypto.randomUUID();
  const now = new Date();
  const exp = new Date(now.getTime() + ttlSec * 1000);
  await prisma.loginChallenge.create({ data: { id, userId, createdAt: now, expiresAt: exp, used: false } });
  return id;
}
export async function getLoginChallenge(loginId: string) {
  const c = await prisma.loginChallenge.findUnique({ where: { id: loginId } });
  if (!c || c.used || c.expiresAt < new Date()) return null;
  return c;
}
export async function markLoginChallengeUsed(loginId: string) {
  await prisma.loginChallenge.update({ where: { id: loginId }, data: { used: true } });
}
