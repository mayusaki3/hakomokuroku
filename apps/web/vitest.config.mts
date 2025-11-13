// apps/web/vitest.config.mts
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: [
      // "@/xxx" -> apps/web/src/xxx
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // 互換のため "@/..." を使っているコードも拾えるように
      { find: /^@\//, replacement: path.resolve(__dirname, './src/') },
    ],
  },
})
