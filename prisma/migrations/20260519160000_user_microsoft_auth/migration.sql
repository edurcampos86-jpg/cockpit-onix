-- Fase 4: per-user OAuth Microsoft (Graph API).
-- Espelha UserGoogleAuth. Convive com o fluxo cowork-sync legado.

-- CreateTable
CREATE TABLE "UserMicrosoftAuth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "microsoftEmail" TEXT NOT NULL,
    "microsoftTenantId" TEXT,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMicrosoftAuth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMicrosoftAuth_userId_key" ON "UserMicrosoftAuth"("userId");

-- AddForeignKey
ALTER TABLE "UserMicrosoftAuth" ADD CONSTRAINT "UserMicrosoftAuth_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
