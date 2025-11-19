import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    // Prisma モックを全テストで有効化
    setupFiles: ['tests/setup/prisma.mock.ts'],
    // 既存のカバレッジ運用に合わせて istanbul を明示
    coverage: {
      provider: 'istanbul',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov', 'html'],
      all: false,
    },
  },
});
