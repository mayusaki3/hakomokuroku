import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reports: ['text', 'lcov'],
      exclude: [
        '**/*.d.ts',
        '**/tests/**',
        '**/node_modules/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
      // prisma クライアントなど他のエイリアスがあればここに
    },
  },
});
