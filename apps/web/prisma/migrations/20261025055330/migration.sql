/*
  Warnings:

  - You are about to alter the column `result` on the `SyncPushReceipt` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SyncPushReceipt" (
    "userId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "operationId"),
    CONSTRAINT "SyncPushReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SyncPushReceipt" ("createdAt", "operationId", "requestFingerprint", "result", "userId") SELECT "createdAt", "operationId", "requestFingerprint", "result", "userId" FROM "SyncPushReceipt";
DROP TABLE "SyncPushReceipt";
ALTER TABLE "new_SyncPushReceipt" RENAME TO "SyncPushReceipt";
CREATE INDEX "SyncPushReceipt_createdAt_idx" ON "SyncPushReceipt"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
