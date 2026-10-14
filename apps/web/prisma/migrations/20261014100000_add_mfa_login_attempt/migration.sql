-- Additive-only migration. Existing User authentication columns remain unchanged.
CREATE TABLE "MfaLoginAttempt" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MfaLoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
