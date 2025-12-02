// 実ランタイム用 Prisma クライアント。
// ※ テストでは必ず vi.mock('@/server/prisma') で差し替えること。
import { PrismaClient } from '@prisma/client';

declare global {
  // 開発中の HMR で多重生成を避けるためのキャッシュ
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma__ ?? (globalThis.__prisma__ = new PrismaClient());
