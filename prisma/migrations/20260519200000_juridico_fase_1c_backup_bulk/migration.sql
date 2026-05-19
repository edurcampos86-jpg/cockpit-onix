-- Jurídico — Fase 1C: BackupExecucao + ImportJob.
-- Sem alteração de tabelas existentes — só CREATE TABLE puro.

-- CreateTable: BackupExecucao
CREATE TABLE "BackupExecucao" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "tamanhoBytes" BIGINT,
    "sucesso" BOOLEAN NOT NULL,
    "erro" TEXT,
    "duracaoSegundos" INTEGER,
    "metadata" JSONB,
    "executadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupExecucao_tipo_executadoEm_idx" ON "BackupExecucao"("tipo", "executadoEm" DESC);
CREATE INDEX "BackupExecucao_executadoEm_idx" ON "BackupExecucao"("executadoEm" DESC);

-- CreateTable: ImportJob
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'juridico_zip',
    "totalArquivos" INTEGER NOT NULL DEFAULT 0,
    "processados" INTEGER NOT NULL DEFAULT 0,
    "sucessos" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "pulados" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "iniciadoPorId" TEXT NOT NULL,
    "zipFilename" TEXT,
    "zipBytes" BIGINT,
    "duracaoSegundos" INTEGER,
    "detalhes" JSONB,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_iniciadoPorId_iniciadoEm_idx" ON "ImportJob"("iniciadoPorId", "iniciadoEm" DESC);
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");
