import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const users = new Map();

  const reset = () => {
    users.clear();
    users.set("U1", {
      id: "db_u1",
      userId: "U1",
      passwordHash: "HASH_OK",
      lockUntil: null,
      totpEnabled: false,
      isActive: true,
    });
  };

  reset();

  const findUser = (where: any) => {
    const key = where?.userId ?? where?.id;

    if (users.has(key)) {
      return users.get(key);
    }

    for (const user of users.values()) {
      if (user.id === key) {
        return user;
      }
    }

    return null;
  };

  return {
    __state: { users, reset },
    prisma: {
      user: {
        findUnique: vi.fn(async (args: any) => findUser(args?.where)),
        findFirst: vi.fn(async (args: any) => findUser(args?.where)),
      },
    },
  };
});

vi.mock("@/server/prisma", () => {
  return { prisma: prismaMock.prisma };
});
