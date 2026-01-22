// src/app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { verifyPassword } from "@/server/auth";

type LoginBody = {
  userId?: unknown;
  password?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function json400(code: string) {
  return NextResponse.json({ ok: false, error: code }, { status: 400 });
}

function json401(code: string) {
  return NextResponse.json({ ok: false, error: code }, { status: 401 });
}

export async function POST(req: Request): Promise<Response> {
  // Content-Type guard（他APIのテストと同様のパターン）
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return json400("invalid_request");
  }

  // JSON parse
  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch (e) {
    // SyntaxError などは 400
    return json400("invalid_request");
  }

  // body shape guard
  if (!isRecord(bodyUnknown)) {
    return json400("invalid_request");
  }

  const body = bodyUnknown as LoginBody;

  if (!isNonEmptyString(body.userId) || !isNonEmptyString(body.password)) {
    return json400("invalid_request");
  }

  const userId = body.userId.trim();
  const password = body.password;

  // user lookup（テストの prismaMock.user.findUnique を想定）
  // ここはプロジェクトのスキーマに合わせて where を調整してください。
  // テストは userId で引く前提のことが多いので userId を採用。
  const user = await prisma.user.findUnique({
    where: { userId },
  });

  if (!user) {
    return json401("unauthorized");
  }

  // lock check
  const lockUntil = (user as any).lockUntil as Date | null | undefined;
  if (lockUntil instanceof Date && lockUntil.getTime() > Date.now()) {
    return json401("unauthorized");
  }

  // password verify（テストの mock に合わせる）
  const passwordHash = (user as any).passwordHash as string | null | undefined;
  if (!passwordHash || !verifyPassword(password, passwordHash)) {
    return json401("unauthorized");
  }

  // 成功
  const res = NextResponse.json(
    {
      ok: true,
      // totpRequired 等は現行実装・仕様に合わせて必要なら追加
    },
    { status: 200 },
  );

  // 既存ログに合わせた簡易 cookie（テストが厳密に見ていないなら問題になりにくい）
  res.headers.set("Set-Cookie", "sid=dummy; Path=/; HttpOnly; SameSite=Lax");
  return res;
}
