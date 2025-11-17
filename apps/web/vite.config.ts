// apps/web/src/__mocks__/prisma.ts
import { vi } from 'vitest'

export const prisma = {
  user: {
    // vi.fn() にすることで mockResolvedValue / mockRejectedValue が使える
    update: vi.fn(),
  },
  themeActive: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
} as const

export function __resetPrismaMocks() {
  for (const model of Object.values(prisma) as any[]) {
    for (const fn of Object.values(model)) {
      if (fn && typeof fn.mockReset === 'function') fn.mockReset()
    }
  }
}

export default prisma
