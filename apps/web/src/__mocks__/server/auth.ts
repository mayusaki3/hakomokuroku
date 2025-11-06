// apps/web/src/__mocks__/server/auth.ts
// 認証ヘルパのモック。API ルートから直接 import されることを想定。
// ここでは「セッション読み取り」と「必須ユーザーID取得」の2関数を提供。
// テストから vi.mock('@/server/auth') すると、このファイルが使われる。

type ReadSessionOk =
  | { ok: true; user: { id: string; userName: string; iconDataUrl: string | null } }
  | { ok: false; user: null };

// 実体は書き換え可能な“現在の状態”
let currentSession: ReadSessionOk = { ok: false, user: null };

// テストから状態を設定できるユーティリティ
export function __setSession(v: ReadSessionOk) {
  currentSession = v;
}

// ルート：/api/auth/me などが使う
export async function readSession(): Promise<ReadSessionOk> {
  return currentSession;
}

// ルート：/api/user/icon などが使う（未ログインなら例外投げる実装に合わせる）
export async function requireUserId(): Promise<string> {
  if (currentSession.ok && currentSession.user) return currentSession.user.id;
  // 実装側で 401 にしているなら、ここは Error を投げる
  const e: any = new Error('Unauthorized');
  e.status = 401;
  throw e;
}
