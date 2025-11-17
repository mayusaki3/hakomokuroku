// apps/web/__mocks__/@/lib/prisma.ts
import { vi } from 'vitest';

/**
 * PrismaClient 風のシングルトン・モック。
 * - メソッドはすべて vi.fn() にする（mockResolvedValue などを利用可能に）。
 * - 参照アドレスは固定し、afterEach で中身だけリセットする。
 */
const prisma = {
  $connect: vi.fn(),
  $disconnect: vi.fn(),
  $transaction: vi.fn(async (arg: any) => {
    if (typeof arg === 'function') return await arg(prisma);
    if (Array.isArray(arg)) return await Promise.all(arg);
    return arg;
  }),

  // ===== 必要モデルのみ =====
  user: {
    update: vi.fn(),          // tests/api.user.icon.spec.ts で使用
    // 必要なら追加: findUnique, upsert, etc.
  },

  themeActive: {
    findUnique: vi.fn(),      // tests/api.settings.theme.active.spec.ts で使用
    upsert: vi.fn(),
  },
} as const;

/** afterEach から呼ぶ：呼び出し履歴・実装をリセット */
export function __resetPrismaMocks() {
  prisma.$connect.mockReset();
  prisma.$disconnect.mockReset();
  prisma.$transaction.mockReset();

  prisma.user.update.mockReset();
  prisma.themeActive.findUnique.mockReset();
  prisma.themeActive.upsert.mockReset();
}

/** default / named 両対応 */
export { prisma };
export default prisma;
