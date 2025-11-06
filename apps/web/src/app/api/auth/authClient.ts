// apps/web/src/app/api/auth/authClient.ts
// 目的: ルート側から「ログイン状態の取得」を行う“モックしやすい”薄いラッパ。
// テストではこのモジュールを vi.mock/require で差し替える。

import { readSession } from '@/server/auth';

/** 現在のログインユーザー（なければ null）を返すクライアント風I/F */
export async function getUser(): Promise<{ user: { id: string } | null }> {
  // server/auth は request-scope (cookies 等) を使うため、
  // ルート実行時にのみ呼ばれる想定。テストではモックで置き換える。
  const sess = await readSession().catch(() => null);
  return { user: sess?.user ?? null };
}
