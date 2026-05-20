-- Jurídico — Fase 2: ingestão por email (Gmail).

-- CreateTable: IngestaoEmail
CREATE TABLE "IngestaoEmail" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT,
    "userId" TEXT NOT NULL,
    "remetente" TEXT NOT NULL,
    "assunto" TEXT,
    "emailDate" TIMESTAMP(3),
    "internalDate" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "motivo" TEXT,
    "contratoArquivoId" TEXT,
    "nomeAnexoPdf" TEXT,
    "processadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestaoEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestaoEmail_gmailMessageId_key" ON "IngestaoEmail"("gmailMessageId");
CREATE INDEX "IngestaoEmail_userId_processadoEm_idx" ON "IngestaoEmail"("userId", "processadoEm" DESC);
CREATE INDEX "IngestaoEmail_status_idx" ON "IngestaoEmail"("status");
CREATE INDEX "IngestaoEmail_gmailThreadId_idx" ON "IngestaoEmail"("gmailThreadId");
