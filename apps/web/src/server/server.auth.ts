// 実ランタイムの auth ユーティリティ。
// テストでは vi.mock('@/server/auth', ...) で差し替える前提。
import { cookies } from 'next/headers';

// セッション読み取りなどは実装側に合わせてください
export async function getUser(): Promise<{ user: { id: string } | null }> {
  const c = cookies().get('sid')?.value;
  if (!c) return { user: null };
  // ここでは簡易に id 固定の体裁（実装に合わせて書き換え可）
  return { user: { id: 'U1' } };
}

export async function requireUserId(): Promise<string> {
  const u = await getUser();
  if (!u.user) throw new Error('UNAUTHORIZED');
  return u.user.id;
}
