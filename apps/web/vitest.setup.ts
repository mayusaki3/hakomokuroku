// Vitest のグローバル設定
import { afterEach } from 'vitest';

// 各テストケース後にモック呼び出しを自動クリア
afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules(); // import キャッシュをクリアし、毎回新鮮なモック状態に
});
