import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // 「@」→ apps/web/src 配下に解決。tests からも同一解決にする
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',       // API ルートは Node で十分（jsdom 不要）
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    clearMocks: true,
    // 失敗時の差分が見やすくなる
    bail: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
