// apps/web/src/__mocks__/server/auth.ts
import { vi } from 'vitest';

// ルートで import される名前と一致させる
export const readSession = vi.fn();     // GET /api/auth/me などで使用
export const requireUserId = vi.fn();   // /api/user/icon で使用
export const getUser = vi.fn();         // 必要なら
