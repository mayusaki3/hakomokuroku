// apps/web/vitest.setup.ts
import { vi, afterEach } from 'vitest';

// 動的 import で“同一インスタンス”を取得
const mod = await import('./__mocks__/@/lib/prisma');
const prisma = mod.prisma;
const reset = mod.__resetPrismaMocks;

// 実装が import される前に alias をモックへ差し替え
vi.mock('@/lib/prisma', () => ({
  default: prisma,
  prisma,                 // named import にも対応
}));

// グローバルに露出（万一の参照ずれ検出・デバッグ用）
(globalThis as any).__PRISMA_MOCK__ = prisma;

afterEach(() => {
  reset();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
