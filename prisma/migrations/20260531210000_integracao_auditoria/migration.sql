-- CreateTable
CREATE TABLE "IntegracaoAuditoria" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "integracao" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL,
    "statusDesde" TIMESTAMP(3),
    "alertadoEm" TIMESTAMP(3),
    "transitorioStreak" INTEGER NOT NULL DEFAULT 0,
    "ultimoErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracaoAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoAuditoria_chave_key" ON "IntegracaoAuditoria"("chave");

-- CreateIndex
CREATE INDEX "IntegracaoAuditoria_integracao_idx" ON "IntegracaoAuditoria"("integracao");
