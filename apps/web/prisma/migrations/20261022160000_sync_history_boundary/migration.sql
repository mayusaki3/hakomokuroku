-- Retention boundary for v0.8 syncSeq Pull.
-- No existing business rows or change logs are modified by this migration.
CREATE TABLE "SyncHistoryBoundary" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "minValidCursor" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "SyncHistoryBoundary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
