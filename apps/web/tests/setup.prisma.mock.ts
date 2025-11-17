// apps/web/tests/setup.prisma.mock.ts
import { vi } from 'vitest';

/**
 * PrismaClient 互換の最小モック。
 * - vi.fn() で各メソッドを作ることで mockResolvedValue / mockRejectedValue が使える
 * - ここに無いモデル/メソッドが必要になったら随時追加する
 */
const prismaMock = {
  // ルートユーティリティ
  $connect: vi.fn(),
  $disconnect: vi.fn(),
  /**
   * $transaction モック
   * - コールバック形式: (tx) => {...} をそのまま同期/非同期実行
   * - 配列形式: [p1, p2] は Promise.all でまとめて実行（簡易）
   */
  $transaction: vi.fn(async (arg: any) => {
    if (typeof arg === 'function') {
      return await arg(prismaMock);
    }
    if (Array.isArray(arg)) {
      return await Promise.all(arg);
    }
    return arg;
  }),

  // ===== 必要なモデルのモック =====
  user: {
    // tests/api.user.icon.spec.ts で使用
    update: vi.fn(),
  },

  themeActive: {
    // tests/api.settings.theme.active.spec.ts で使用
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
} as const;

/**
 * import prisma from '@/server/prisma'
 * import { prisma } from '@/server/prisma'
 * の両パターンに対応するため default と named を両方エクスポート
 */
vi.mock('@/server/prisma', () => {
  return {
    default: prismaMock,
    prisma: prismaMock,
  };
});

// 必要なら他のテストから参照できるようにエクスポートしておく
export type PrismaMock = typeof prismaMock;
export const prisma = prismaMock;
export default prismaMock;
