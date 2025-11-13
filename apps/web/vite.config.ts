// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    // 既存のプラグイン（例：react() など）があればここに並べる
  ],
  test: {
    // v8 カバレッジで Windows/Node 環境の ERR_INSPECTOR 対策（任意）
    threads: false, // = --threads=false と同じ
    coverage: { provider: 'v8' },
  },
});
