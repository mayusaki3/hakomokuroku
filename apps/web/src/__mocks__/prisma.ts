// apps/web/src/__mocks__/prisma.ts
// Vitest の vi.mock('@/server/prisma') で読み込まれる手作りモック。
// 目的：API ルートが Prisma に触れる箇所を、インメモリ実装で置き換える。
// 最小で「ユーザー」と「ユーザーのアクティブテーマ」を扱えるようにする。

type User = {
  id: string;
  userName: string;
  iconDataUrl: string | null;
};

type UserActiveTheme = {
  userId: string;
  themeId: string | null; // 未設定は null
};

// ----- インメモリDB（テストごとに初期化される前提。必要なら各テストの beforeEach で書き換え） -----
const users = new Map<string, User>([
  // /api/user/icon の成功系テストで使う既定ユーザー
  ['U1', { id: 'U1', userName: 'Alice', iconDataUrl: null }],
]);

const userActiveTheme = new Map<string, UserActiveTheme>([
  // /api/settings/theme/active のログイン時テスト用（themeId: 'T1' を期待）
  ['U1', { userId: 'U1', themeId: 'T1' }],
]);

// ----- Prisma 風の最小メソッド郡 -----
// 実プロダクト側の route が呼んでいるメソッド名に合わせて増減してください。
// 下記は「よくある」呼ばれ方に合わせた最小セット。

export const prisma = {
  user: {
    // 例: prisma.user.findUnique({ where: { id } })
    async findUnique(opts: { where: { id: string } }) {
      const u = users.get(opts.where.id);
      return u ? { ...u } : null;
    },
    // 例: prisma.user.update({ where: { id }, data: { iconDataUrl } })
    async update(opts: { where: { id: string }; data: Partial<User> }) {
      const u = users.get(opts.where.id);
      if (!u) throw new Error('Record not found');
      const nu = { ...u, ...opts.data };
      users.set(opts.where.id, nu);
      return { ...nu };
    },
  },

  // 実装が「ユーザーのアクティブテーマ」をどう持っているかで以下を調整
  // 1) テーブル: userActiveTheme っぽいコレクションを想定
  userActiveTheme: {
    // 例: prisma.userActiveTheme.findUnique({ where: { userId } })
    async findUnique(opts: { where: { userId: string } }) {
      const rec = userActiveTheme.get(opts.where.userId);
      return rec ? { ...rec } : null;
    },
    // 例: prisma.userActiveTheme.upsert({ where: { userId }, create: {...}, update: {...} })
    async upsert(opts: {
      where: { userId: string };
      create: UserActiveTheme;
      update: Partial<UserActiveTheme>;
    }) {
      const cur = userActiveTheme.get(opts.where.userId);
      if (!cur) {
        userActiveTheme.set(opts.where.userId, { ...opts.create });
        return { ...opts.create };
      }
      const nu = { ...cur, ...opts.update };
      userActiveTheme.set(opts.where.userId, nu);
      return { ...nu };
    },
  },

  // ルートが別名（例: settings, themeActivation 等）で参照しているなら
  // 上記 userActiveTheme と同等の findUnique をエイリアスで持たせる
  settings: {
    async getDefaultTheme() {
      // 未ログイン時の既定テーマ。テスト期待に合わせて固定IDでもOK。
      return { themeId: 'default' };
    },
  },
};

// テストが初期状態を作り直したい時向けのリセットAPI（任意）
export function __resetMocks__() {
  users.clear();
  users.set('U1', { id: 'U1', userName: 'Alice', iconDataUrl: null });

  userActiveTheme.clear();
  userActiveTheme.set('U1', { userId: 'U1', themeId: 'T1' });
}
