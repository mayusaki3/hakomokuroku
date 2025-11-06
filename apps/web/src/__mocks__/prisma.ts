// Prisma をテストで使うための軽量モック。
// 各テストの beforeEach で返り値を上書きして使う想定。

export const prisma = {
  user: {
    // GET /api/auth/me 用（必要なら上書き）
    findUnique: vi.fn(), 
    // PUT /api/user/icon 用（必要なら上書き）
    update: vi.fn(),
  },
  themeActive: {
    // GET /api/settings/theme/active 用（必要なら上書き）
    findUnique: vi.fn(),
  },
  userSettings: {
    findFirst: vi.fn(),       // 実装に合わせて
  },
} as any;
