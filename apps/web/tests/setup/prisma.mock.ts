// Vitest で Prisma クライアントをモックする共通セットアップ
import { vi } from 'vitest';

const themeActive = {
  findUnique: vi.fn(),
};

const user = {
  update: vi.fn(),
  updateMany: vi.fn(),
};

vi.mock('@/server/prisma', () => {
  return {
    prisma: { themeActive, user },
  };
});

// 任意: テスト側で直接リセット/上書きしたい場合に備えて export
export const __mock = { themeActive, user };
