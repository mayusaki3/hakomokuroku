import { prisma } from '@/server/prisma';
import { getUser } from '@/server/auth';

function json(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const DEFAULT_THEME_ID = 'default';

export async function GET() {
  try {
    const { user } = await getUser();

    // 未ログインは既定テーマ（「実装に合わせる」）
    if (!user) {
      return json({ ok: true, active: { themeId: DEFAULT_THEME_ID } }, 200);
    }

    // ログイン済みは DB 参照。なければ既定
    const row = await prisma.themeActive.findUnique({
      where: { userId: user.id },
      select: { themeId: true },
    });
    const themeId = row?.themeId ?? DEFAULT_THEME_ID;
    return json({ ok: true, active: { themeId } }, 200);
  } catch {
    // DB 例外は 500/503 想定。ここでは 500 固定（テスト側は [500,503] 許容）
    return json({ ok: false, error: 'db error' }, 500);
  }
}
