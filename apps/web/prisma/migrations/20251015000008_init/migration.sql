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
    "recoveryCodes" JSONB,
    "totpFailCount" INTEGER NOT NULL DEFAULT 0,
    "lockUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SyncToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "SyncToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "tags" JSONB,
    "thumbs" JSONB,
    "meta" JSONB,
    "aiState" TEXT,
    "aiUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Box_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" JSONB,
    "note" TEXT,
    "thumbs" JSONB,
    "meta" JSONB,
    "aiState" TEXT,
    "aiUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Item_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoxLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "thumbs" JSONB,
    "note" TEXT,
    "meta" JSONB,
    "aiState" TEXT,
    "aiUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoxLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BoxLocation_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncToken_tokenHash_key" ON "SyncToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SyncToken_userId_idx" ON "SyncToken"("userId");

-- CreateIndex
CREATE INDEX "SyncToken_expiresAt_idx" ON "SyncToken"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginChallenge_userId_expiresAt_idx" ON "LoginChallenge"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Box_userId_updatedAt_idx" ON "Box"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Box_aiState_updatedAt_idx" ON "Box"("aiState", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Box_userId_code_key" ON "Box"("userId", "code");

-- CreateIndex
CREATE INDEX "Item_userId_updatedAt_idx" ON "Item"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Item_boxId_idx" ON "Item"("boxId");

-- CreateIndex
CREATE UNIQUE INDEX "BoxLocation_boxId_key" ON "BoxLocation"("boxId");

-- CreateIndex
CREATE INDEX "BoxLocation_userId_updatedAt_idx" ON "BoxLocation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Tag_enabled_kind_name_idx" ON "Tag"("enabled", "kind", "name");

-- CreateIndex
CREATE INDEX "Tag_userId_name_kind_idx" ON "Tag"("userId", "name", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_kind_key" ON "Tag"("userId", "name", "kind");
