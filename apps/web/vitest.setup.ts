// apps/web/vitest.setup.ts
import { afterEach } from 'vitest';

// 重要：グローバル Prisma モックを事前ロード
// ※ setup.prisma.mock.ts の配置場所を tests/ 配下に統一
import './tests/setup.prisma.mock';

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules(); // 各テストでクリーンなモック状態に
});
