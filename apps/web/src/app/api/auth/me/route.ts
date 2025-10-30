// 最新状態を毎回返す。RSCの自動キャッシュを無効化して401/200を即反映させる。
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readSessionCookie, sha256hex } from '@/server/auth';

export async function GET() {
  try {
    const st = readSessionCookie();
    if (!st) {
      return new NextResponse(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const tok = await prisma.syncToken.findFirst({
      where: { tokenHash: sha256hex(st) },
      select: { userId: true, expiresAt: true },
    });
    if (!tok || tok.expiresAt <= new Date()) {
      return new NextResponse(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: tok.userId },
      select: {
        id: true,
        userId: true,
        userName: true,
        iconDataUrl: true,
        totpEnabled: true,
      },
    });

    return new NextResponse(JSON.stringify({ ok: true, user }), {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return new NextResponse(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
