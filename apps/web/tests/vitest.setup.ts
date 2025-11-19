// apps/web/tests/vitest.setup.ts
import { afterEach, vi } from 'vitest';

// --- 中央モック ---
// Prisma モック（テストから mockResolvedValue などを直接呼べるよう vi.fn で定義）
vi.mock('@/lib/prisma', () => {
  const themeActive = { findUnique: vi.fn() };
  const user = { update: vi.fn() };
  return { prisma: { themeActive, user } };
});

// 認証モック
vi.mock('@/lib/auth/server', () => {
  return {
    requireUserId: vi.fn(), // デフォルトは throw しない。各テストで上書き
    getUser: vi.fn(),
  };
});

// dataURL ユーティリティのモック（正常系はここで実装、異常系は各テストで spyOn して上書き）
vi.mock('@/lib/dataurl', () => {
  return {
    parseAndNormalizeDataURL: vi.fn((dataUrl: unknown) => {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
        const e = new Error('invalid data url');
        (e as any).status = 400;
        throw e;
      }
      // ごく簡易： "data:image/png;base64,AAAA" を許容
      const m = /^data:([^;]+);base64,(.*)$/i.exec(dataUrl);
      if (!m) {
        const e = new Error('invalid data url');
        (e as any).status = 400;
        throw e;
      }
      const mime = m[1].toLowerCase();
      if (mime !== 'image/png') {
        const e = new Error('unsupported mime');
        (e as any).status = 415;
        throw e;
      }
      const base64 = m[2].replace(/\s+/g, '');
      if (!base64) {
        const e = new Error('empty payload');
        (e as any).status = 400;
        throw e;
      }
      // デコード可否だけざっくり確認
      Buffer.from(base64, 'base64');
      return { mime: 'image/png', buffer: Buffer.from(base64, 'base64') };
    }),
  };
});

// 各テスト後にモック状態をリセット
afterEach(() => {
  vi.clearAllMocks();
});
