-- CreateTable
CREATE TABLE "Box" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "tags" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Item_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Box_code_key" ON "Box"("code");
