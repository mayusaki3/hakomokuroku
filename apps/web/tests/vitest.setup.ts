// apps/web/tests/vitest.setup.ts
import { vi, beforeAll } from 'vitest';

// 1) Prisma モック
vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      user: {
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      themeActive: {
        findUnique: vi.fn(),
      },
    },
  };
});

// 2) ついでに auth もテストで上書きしやすい実体を用意（必要に応じて）
vi.mock('@/lib/auth/server', () => {
  return {
    // 各テストで .mockResolvedValue / .mockRejectedValue して使う
    requireUserId: vi.fn(),
    getUser:     vi.fn(),
  };
});

// 3) dataurl ユーティリティをスパイできるよう「実体」を読み込ませる（モックはしない）
beforeAll(() => {
  // 何もしない。ここで import しないのは、テストごとに spyOn できるようにするため。
});
