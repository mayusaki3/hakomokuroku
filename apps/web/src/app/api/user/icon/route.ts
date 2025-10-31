// apps/web/src/app/api/user/icon/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/prisma'; // 既存の Prisma import に合わせて

// DataURLの軽いバリデーション
function pickDataUrl(body: any): string | null {
  const val = body?.iconDataUrl ?? body?.dataUrl;
  if (typeof val !== 'string') return null;
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(val)) return null;
  const b64 = val.split(',', 2)[1] || '';
  const approxBytes = Math.floor(b64.length * 0.75);
  if (approxBytes > 2 * 1024 * 1024) return null; // ~2MB制限
  return val;
}

// 認証ヘルパに依存しない：自前で /api/settings/user を呼んでユーザー解決
async function resolveUser(req: NextRequest): Promise<{ id: string } | null> {
  // dev環境での SSL ミスマッチを避けるため、Host と Proto から明示的に Origin を組み立てる
  const host = req.headers.get('host') ?? 'localhost:3000';
  // もしプロキシ配下なら x-forwarded-proto が来るが、ローカル dev は http を既定にする
  const proto = (req.headers.get('x-forwarded-proto') || 'http').replace(/[^a-z]/gi, '');
  const origin = `${proto}://${host}`;
  const meUrl = `${origin}/api/settings/user`;
  try {
    const r = await fetch(meUrl, {
      method: 'GET',
      headers: {
        cookie: req.headers.get('cookie') ?? '',
        accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null as any);
    return j?.user && j.user.id ? { id: j.user.id } : null;
  } catch (e) {
    console.error('resolveUser fetch failed:', e);
    return null;
  }
}

export async function PUT(req: NextRequest) {
  try {
    // 1) 認証
    const user = await resolveUser(req);
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // 2) 入力
    const body = await req.json().catch(() => (null as any));
    const dataUrl = pickDataUrl(body);
    if (!dataUrl) {
      return NextResponse.json({ ok: false, error: 'invalid dataUrl' }, { status: 400 });
    }

    // 3) 保存
    await prisma.user.update({
      where: { id: user.id },
      data: { iconDataUrl: dataUrl },
      select: { id: true },
    });

    // 4) 応答
    return NextResponse.json({ ok: true, iconDataUrl: dataUrl }, { status: 200 });
  } catch (e) {
    console.error('PUT /api/user/icon failed:', e);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
