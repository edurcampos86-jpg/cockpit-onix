-- CreateTable
CREATE TABLE "Implementacao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "departamento" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'melhoria',
    "porQue" TEXT NOT NULL,
    "como" TEXT,
    "oQue" TEXT NOT NULL,
    "printUrl" TEXT,
    "reach" INTEGER,
    "impact" INTEGER,
    "confidence" INTEGER,
    "effort" INTEGER,
    "score" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'triagem',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Implementacao_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Implementacao_empresaId_status_idx" ON "Implementacao"("empresaId", "status");
-- CreateIndex
CREATE INDEX "Implementacao_userId_idx" ON "Implementacao"("userId");
-- AddForeignKey
ALTER TABLE "Implementacao" ADD CONSTRAINT "Implementacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
