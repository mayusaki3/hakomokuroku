-- Persist successful Push operation results to make network retries idempotent.
-- The userId foreign key scopes operation identifiers to authenticated users.
CREATE TABLE "SyncPushReceipt" (
    "userId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncPushReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("userId", "operationId")
);
CREATE INDEX "SyncPushReceipt_createdAt_idx" ON "SyncPushReceipt"("createdAt");
