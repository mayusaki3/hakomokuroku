-- CreateTable
CREATE TABLE "ThemeActive" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "themeId" TEXT,
    "vars" JSONB,
    "updatedAt" DATETIME NOT NULL
);
