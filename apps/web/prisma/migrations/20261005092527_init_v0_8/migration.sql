-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "iconDataUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpSecretEnc" TEXT,
    "totpPendingSecretEnc" TEXT,
    "totpPendingAt" DATETIME,
    "recoveryCodes" JSONB,
    "totpFailCount" INTEGER NOT NULL DEFAULT 0,
    "lockUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Box" (
    "userId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT,
    "parentBoxId" TEXT,
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
    CONSTRAINT "Box_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Box_userId_locationId_fkey" FOREIGN KEY ("userId", "locationId") REFERENCES "BoxLocation" ("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Box_userId_parentBoxId_fkey" FOREIGN KEY ("userId", "parentBoxId") REFERENCES "Box" ("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "userId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "BoxLocation" (
    "userId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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
    CONSTRAINT "BoxLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastSeq" BIGINT NOT NULL
);

-- CreateTable
CREATE TABLE "SyncChangeLog" (
    "syncSeq" BIGINT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "revision" BIGINT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "serverUpdatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncConflict" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "clientBaseRevision" BIGINT NOT NULL,
    "clientContentHash" TEXT NOT NULL,
    "clientPayload" JSONB NOT NULL,
    "serverRevisionAtConflict" BIGINT NOT NULL,
    "serverContentHashAtConflict" TEXT NOT NULL,
    "serverPayloadAtConflict" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncConflict_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestoreLock" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "lockTokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "renewedAt" DATETIME NOT NULL,
    CONSTRAINT "RestoreLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestoreApplyResult" (
    "userId" TEXT NOT NULL,
    "applyId" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "committedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "applyId"),
    CONSTRAINT "RestoreApplyResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FullResyncSnapshot" (
    "snapshotId" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "snapshotSeq" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "FullResyncSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FullResyncSnapshotEntity" (
    "snapshotId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "revision" BIGINT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "syncSeq" BIGINT NOT NULL,
    "serverUpdatedAt" DATETIME NOT NULL,
    "deleted" BOOLEAN NOT NULL,

    PRIMARY KEY ("snapshotId", "entityType", "entityId"),
    CONSTRAINT "FullResyncSnapshotEntity_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "FullResyncSnapshot" ("snapshotId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Device" (
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT,
    "activePrefix" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "deviceId"),
    CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DevicePrefix" (
    "userId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "allocatedAt" DATETIME NOT NULL,
    "activatedAt" DATETIME NOT NULL,
    "retiredAt" DATETIME,

    PRIMARY KEY ("userId", "prefix"),
    CONSTRAINT "DevicePrefix_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DevicePrefix_userId_deviceId_fkey" FOREIGN KEY ("userId", "deviceId") REFERENCES "Device" ("userId", "deviceId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseTheme" TEXT NOT NULL,
    "tokens" JSONB NOT NULL,
    "wallpaper" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Theme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "activeTheme" TEXT NOT NULL DEFAULT 'builtin:system',
    "uiSettings" JSONB,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");

-- CreateIndex
CREATE INDEX "User_userId_idx" ON "User"("userId");

-- CreateIndex
CREATE INDEX "LoginChallenge_userId_expiresAt_idx" ON "LoginChallenge"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "LoginChallenge_userId_createdAt_idx" ON "LoginChallenge"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Box_userId_serverUpdatedAt_idx" ON "Box"("userId", "serverUpdatedAt");

-- CreateIndex
CREATE INDEX "Box_userId_syncSeq_idx" ON "Box"("userId", "syncSeq");

-- CreateIndex
CREATE INDEX "Box_userId_locationId_deletedAt_idx" ON "Box"("userId", "locationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Box_userId_parentBoxId_deletedAt_idx" ON "Box"("userId", "parentBoxId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Box_userId_code_key" ON "Box"("userId", "code");

-- CreateIndex
CREATE INDEX "Item_userId_serverUpdatedAt_idx" ON "Item"("userId", "serverUpdatedAt");

-- CreateIndex
CREATE INDEX "Item_userId_syncSeq_idx" ON "Item"("userId", "syncSeq");

-- CreateIndex
CREATE INDEX "Item_userId_boxId_deletedAt_idx" ON "Item"("userId", "boxId", "deletedAt");

-- CreateIndex
CREATE INDEX "BoxLocation_userId_serverUpdatedAt_idx" ON "BoxLocation"("userId", "serverUpdatedAt");

-- CreateIndex
CREATE INDEX "BoxLocation_userId_syncSeq_idx" ON "BoxLocation"("userId", "syncSeq");

-- CreateIndex
CREATE INDEX "BoxLocation_userId_name_deletedAt_idx" ON "BoxLocation"("userId", "name", "deletedAt");

-- CreateIndex
CREATE INDEX "SyncChangeLog_userId_syncSeq_idx" ON "SyncChangeLog"("userId", "syncSeq");

-- CreateIndex
CREATE INDEX "SyncChangeLog_serverUpdatedAt_idx" ON "SyncChangeLog"("serverUpdatedAt");

-- CreateIndex
CREATE INDEX "SyncConflict_userId_entityType_entityId_idx" ON "SyncConflict"("userId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncConflict_userId_entityType_entityId_key" ON "SyncConflict"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "RestoreLock_expiresAt_idx" ON "RestoreLock"("expiresAt");

-- CreateIndex
CREATE INDEX "RestoreApplyResult_committedAt_idx" ON "RestoreApplyResult"("committedAt");

-- CreateIndex
CREATE INDEX "FullResyncSnapshot_userId_createdAt_idx" ON "FullResyncSnapshot"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FullResyncSnapshot_expiresAt_idx" ON "FullResyncSnapshot"("expiresAt");

-- CreateIndex
CREATE INDEX "Device_userId_lastUsedAt_idx" ON "Device"("userId", "lastUsedAt");

-- CreateIndex
CREATE INDEX "DevicePrefix_userId_deviceId_allocatedAt_idx" ON "DevicePrefix"("userId", "deviceId", "allocatedAt");

-- CreateIndex
CREATE INDEX "DevicePrefix_userId_deviceId_retiredAt_idx" ON "DevicePrefix"("userId", "deviceId", "retiredAt");

-- CreateIndex
CREATE INDEX "Theme_userId_updatedAt_idx" ON "Theme"("userId", "updatedAt");
