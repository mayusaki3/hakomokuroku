// ユーザーアイコン（DataURL）更新専用。
// body: { iconDataUrl: string } 例: "data:image/png;base64,...."
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sha256hex } from '@/server/crypto';
import { readSession } from '@/server/auth';

export async function PUT(req: NextRequest) {
  try {
    const { iconDataUrl } = await req.json();

    // 最小バリデーション: 先頭が data: で始まる
    if (typeof iconDataUrl !== 'string' || !iconDataUrl.startsWith('data:')) {
      return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    }

    const raw = cookies().get('st')?.value;
    if (!raw) return NextResponse.json({ ok: false }, { status: 401 });
    const tokenHash = sha256hex(raw);
    const session = await readSession(tokenHash);
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    await prisma.user.update({
      where: { id: session.userId },
      data: { iconDataUrl },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
