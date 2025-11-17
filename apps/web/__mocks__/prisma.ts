// apps/web/__mocks__/prisma.ts
// Prisma クライアントの最小モック。
// - テストで使用するメソッドのみ vi.fn() を提供
// - mockResolvedValue / mockRejectedValue が使える
// - __resetPrismaMocks() で毎テスト初期化

import { vi } from 'vitest';

// 必要になったらここにモック対象メソッドを追加する
const prisma = {
  user: {
    // /api/user/icon で使用
    update: vi.fn(), // 使用例: (prisma.user.update as any).mockResolvedValue(...)
  },
  themeActive: {
    // /api/settings/theme/active で使用
    findUnique: vi.fn(), // 使用例: (prisma.themeActive.findUnique as any).mockResolvedValue(...)
  },
  // 例：必要になれば以下のように増やす
  // theme: { findUnique: vi.fn() },
} as const;

// 各テスト後に呼び出す初期化関数（vitest.setup.ts から利用）
export function __resetPrismaMocks() {
  prisma.user.update.mockReset();
  prisma.themeActive.findUnique.mockReset();
  // 追加したらここにも追記
}

// デフォルトエクスポート（型は any で十分）
export default prisma as any;
