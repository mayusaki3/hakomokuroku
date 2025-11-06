// apps/web/vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // 「@」 → apps/web/src
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
    bail: false,
    // 重要：下のセットアップを必ず読み込む
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.spec.ts'],

    coverage: {
      provider: 'v8',                  // デフォルト。node v8 インストゥルメント
      reportsDirectory: './coverage',  // 出力先（相対: apps/web/coverage）
      reporter: ['text', 'html', 'lcov'],
      all: true,                       // 未テストのファイルも対象に含める
      include: [
        'src/app/api/auth/me/route.ts',
        'src/app/api/settings/theme/active/route.ts',
        'src/app/api/user/icon/route.ts',
      ],                               // 対象
      exclude: [
        '**/*.d.ts',
        '**/__mocks__/**',
        'node_modules/**',
        '.next/**',
      ],
    },    
  },
});
