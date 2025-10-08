-- CreateTable
CREATE TABLE "Box" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "tags" JSONB,
    "thumbs" JSONB,
    "meta" JSONB,
    "aiState" TEXT,
    "aiUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "Item_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoxLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boxId" TEXT NOT NULL,
    "thumbs" JSONB,
    "note" TEXT,
    "meta" JSONB,
    "aiState" TEXT,
    "aiUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoxLocation_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Box_code_key" ON "Box"("code");

-- CreateIndex
CREATE INDEX "Box_updatedAt_idx" ON "Box"("updatedAt");

-- CreateIndex
CREATE INDEX "Box_aiState_updatedAt_idx" ON "Box"("aiState", "updatedAt");

-- CreateIndex
CREATE INDEX "Item_boxId_idx" ON "Item"("boxId");

-- CreateIndex
CREATE INDEX "Item_updatedAt_idx" ON "Item"("updatedAt");

-- CreateIndex
CREATE INDEX "Item_aiState_updatedAt_idx" ON "Item"("aiState", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BoxLocation_boxId_key" ON "BoxLocation"("boxId");

-- CreateIndex
CREATE INDEX "BoxLocation_boxId_idx" ON "BoxLocation"("boxId");

-- CreateIndex
CREATE INDEX "BoxLocation_updatedAt_idx" ON "BoxLocation"("updatedAt");

-- CreateIndex
CREATE INDEX "BoxLocation_aiState_updatedAt_idx" ON "BoxLocation"("aiState", "updatedAt");

-- CreateIndex
CREATE INDEX "Tag_enabled_kind_name_idx" ON "Tag"("enabled", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_kind_key" ON "Tag"("name", "kind");
