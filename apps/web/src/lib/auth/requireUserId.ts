/**
 * 認可（ログイン必須）判定の薄いラッパー。
 *
 * - 本番: server/auth の requireUserId を呼ぶ
 * - テスト: このモジュールを vi.mock して差し替える（cookies() 問題を回避）
 */
export { requireUserId } from '@/server/auth';
