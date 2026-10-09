-- Preserve all existing sessions; the new device association is nullable.
-- SQLite requires a table rebuild to add the composite foreign key.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastSeenAt" DATETIME,
    "deviceId" TEXT,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuthSession_userId_deviceId_fkey" FOREIGN KEY ("userId", "deviceId") REFERENCES "Device" ("userId", "deviceId") ON DELETE NO ACTION ON UPDATE CASCADE
);

INSERT INTO "new_AuthSession" ("id", "userId", "tokenHash", "createdAt", "expiresAt", "revokedAt", "lastSeenAt", "deviceId")
SELECT "id", "userId", "tokenHash", "createdAt", "expiresAt", "revokedAt", "lastSeenAt", NULL
FROM "AuthSession";

DROP TABLE "AuthSession";
ALTER TABLE "new_AuthSession" RENAME TO "AuthSession";

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_deviceId_idx" ON "AuthSession"("userId", "deviceId");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

PRAGMA foreign_keys=ON;
