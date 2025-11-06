// apps/web/tests/setup.prisma.mock.ts
import { vi } from 'vitest';

// "@/server/prisma" モジュールそのものをモック化
vi.mock('@/server/prisma', () => {
  const prisma = {
    $transaction: vi.fn(async (fn: any) => fn(prisma)),

    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },

    // /api/settings/theme/active が参照する可能性
    themeActive: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },

    // 設定系 API 用（必要に応じて）
    setting: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return { prisma };
});
