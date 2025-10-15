import { NextResponse } from "next/server";

export async function POST() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.append("Set-Cookie", "hk_token=; Path=/; Max-Age=0; SameSite=Lax");
  return res;
}
