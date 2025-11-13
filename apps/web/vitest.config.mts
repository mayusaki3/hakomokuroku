// apps/web/vitest.config.mts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export default defineConfig({
  // apps/web 配下をルートに固定（pnpm -C apps/web での実行に一致）
  root: __dirname,

  plugins: [
    // tsconfig.json の "paths" をそのまま解決
    tsconfigPaths(),
  ],

  resolve: {
    // 念のため alias も直指定（paths が無い／ズレている場合の保険）
    alias: {
      '@': resolve(__dirname, 'src'),
    },
    // Node の条件解決を優先
    conditions: ['node'],
  },

  server: {
    deps: {
      // 以前の test.deps.inline 相当
      inline: [/^(@|\w)/],
    },
  },

  test: {
    // API ルート等のユニットテスト向けに node 環境を使用
    environment: 'node',

    // グローバルセットアップ（Prisma のモック等）をここで読み込む
    setupFiles: ['./vitest.setup.ts'],

    // *.spec.ts 配下を対象
    include: ['tests/**/*.spec.ts'],

    // 失敗時に詳しいスタックを出す
    bail: 0,
    passWithNoTests: false,

    // カバレッジ
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov', 'html'],
      // 外部バンドル・生成物は除外
      exclude: [
        '**/*.d.ts',
        '**/node_modules/**',
        'tests/**',
        '**/.next/**',
        '**/vendor-chunks/**',
      ],
      // 外部ソースを許可（ソースマップ欠落でも落とさない）
      allowExternal: true,
    },

    // 変換ターゲット
    deps: {
      // ESM 前提の依存でもトランスパイルを許可
      inline: [/^(@|\w)/],
    },

    // tsconfig の moduleResolution=NodeNext/Bundler どちらでも動くように
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
