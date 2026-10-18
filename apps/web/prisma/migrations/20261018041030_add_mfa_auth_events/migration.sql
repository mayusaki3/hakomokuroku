-- CreateTable
CREATE TABLE "MfaAuthEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "codeHash" TEXT,
    "admissionId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MfaAuthEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MfaRecoveryRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "admissionId" INTEGER NOT NULL,
    "eventId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MfaRecoveryRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);


-- CreateIndex
CREATE INDEX "MfaAuthEvent_userId_id_idx" ON "MfaAuthEvent"("userId", "id");

-- CreateIndex
CREATE INDEX "MfaAuthEvent_userId_challengeId_idx" ON "MfaAuthEvent"("userId", "challengeId");

-- CreateIndex
CREATE INDEX "MfaAuthEvent_createdAt_idx" ON "MfaAuthEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryRedemption_eventId_key" ON "MfaRecoveryRedemption"("eventId");

-- CreateIndex
CREATE INDEX "MfaRecoveryRedemption_userId_createdAt_idx" ON "MfaRecoveryRedemption"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryRedemption_userId_codeHash_key" ON "MfaRecoveryRedemption"("userId", "codeHash");
