-- Alter Item.boxId from required to optional while preserving all existing Item rows.
-- Business deletion remains a tombstone operation; do not cascade between business entities.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Item" (
    "userId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "boxId" TEXT,
    "name" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "note" TEXT,
    "thumbs" JSONB NOT NULL,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "serverUpdatedAt" DATETIME,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL,
    "syncSeq" BIGINT,
    PRIMARY KEY ("userId", "id"),
    CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Item_userId_boxId_fkey" FOREIGN KEY ("userId", "boxId") REFERENCES "Box" ("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Item" ("userId", "id", "boxId", "name", "tags", "note", "thumbs", "meta", "createdAt", "updatedAt", "deletedAt", "serverUpdatedAt", "revision", "contentHash", "syncSeq")
SELECT "userId", "id", "boxId", "name", "tags", "note", "thumbs", "meta", "createdAt", "updatedAt", "deletedAt", "serverUpdatedAt", "revision", "contentHash", "syncSeq" FROM "Item";

DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";

CREATE INDEX "Item_userId_serverUpdatedAt_idx" ON "Item"("userId", "serverUpdatedAt");
CREATE INDEX "Item_userId_syncSeq_idx" ON "Item"("userId", "syncSeq");
CREATE INDEX "Item_userId_boxId_deletedAt_idx" ON "Item"("userId", "boxId", "deletedAt");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
