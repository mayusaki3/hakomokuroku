// apps/web/__mocks__/prisma.ts
// Vitest 用の手書き Prisma モック。
// - 各メソッドは vi.fn() にし、テストから mockResolvedValue / mockRejectedValue を直接指定できるようにする
// - __resetPrismaMocks() で毎テスト後に副作用をクリア

import { vi } from 'vitest';

type Fn = ReturnType<typeof vi.fn>;

type PrismaMock = {
  user: {
    update: Fn;
  };
  themeActive: {
    findUnique: Fn;
  };
};

export const prisma: PrismaMock = {
  user: {
    update: vi.fn(),
  },
  themeActive: {
    findUnique: vi.fn(),
  },
};

// 各モックを初期化（呼び出し履歴/実装をリセット）
export function __resetPrismaMocks() {
  prisma.user.update.mockReset();
  prisma.themeActive.findUnique.mockReset();
}

export default prisma;
