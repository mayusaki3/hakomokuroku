// apps/web/src/lib/auth.ts
import { cookies, headers } from 'next/headers';
import { prisma } from './prisma';

// プロジェクトのトークン仕様に合わせて実装すること（以下は例）
export async function getCurrentUser() {
  const token = cookies().get('hk_token')?.value || '';
  if (!token) return null;
  // 例：SyncToken テーブルで tokenHash 照合
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = Buffer.from(h).toString('hex');
  const t = await prisma.syncToken.findFirst({ where: { tokenHash: hash } });
  if (!t) return null;
  return prisma.user.findUnique({ where: { id: t.userId } });
}
