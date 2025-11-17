// apps/web/vitest.config.mts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    setupFiles: ['tests/vitest.setup.ts'],
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // v2系では --threads は廃止。必要なら pool を明示
    pool: 'forks',

    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/app/api/**/*.ts',
        'src/lib/**/*.ts',
        'src/server/**/*.ts',
      ],
      exclude: [
        '**/*.d.ts',
        'src/**/__mocks__/**',
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
        'public/**',
      ],
    },
  },
})
