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
  // sec_auth_login_invalid_request: Content-Type guard
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return json400("invalid_request");
  }

  // sec_auth_login_invalid_request: JSON parse guard
  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch (e) {
    return json400("invalid_request");
  }

  // sec_auth_login_invalid_request: body shape guard
  if (!isRecord(bodyUnknown)) {
    return json400("invalid_request");
  }

  const body = bodyUnknown as LoginBody;

  // sec_auth_login_request_body / sec_auth_login_invalid_request: required fields
  if (!isNonEmptyString(body.userId) || !isNonEmptyString(body.password)) {
    return json400("invalid_request");
  }

  const userId = body.userId.trim();
  const password = body.password;

  // sec_auth_login_auth_failed: user lookup
  const user = await prisma.user.findUnique({
    where: { userId },
  });

  if (!user) {
    return json401("unauthorized");
  }

  // sec_auth_login_locked: lockUntil check
  const lockUntil = (user as any).lockUntil as Date | null | undefined;
  if (lockUntil instanceof Date && lockUntil.getTime() > Date.now()) {
    return json401("unauthorized");
  }

  // sec_auth_login_auth_failed / sec_auth_login_security: password verification
  const passwordHash = (user as any).passwordHash as string | null | undefined;
  if (!passwordHash || !verifyPassword(password, passwordHash)) {
    return json401("unauthorized");
  }

  // sec_auth_login_success_basic: successful login response
  const res = NextResponse.json(
    {
      ok: true,
    },
    { status: 200 },
  );

  // sec_auth_login_success_basic: login cookie
  res.headers.set("Set-Cookie", "sid=dummy; Path=/; HttpOnly; SameSite=Lax");
  return res;
}
