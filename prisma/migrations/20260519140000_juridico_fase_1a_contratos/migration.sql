-- Jurídico — Fase 1A: cofre de contratos no Backblaze B2 + extração via Claude.
-- Adiciona 2 tabelas novas. Não modifica AcordoComercial nem User — as
-- relations declaradas no schema vivem só na camada Prisma (FKs ficam em
-- ContratoArquivo).

-- CreateTable: ContratoArquivo
CREATE TABLE "ContratoArquivo" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT,
    "nomeOriginal" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "tamanhoBytes" BIGINT NOT NULL,
    "b2Bucket" TEXT NOT NULL DEFAULT 'onix-cockpit-contratos',
    "b2Key" TEXT NOT NULL,
    "b2ETag" TEXT,
    "hashSha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pendente_revisao',
    "origemImportacao" TEXT NOT NULL DEFAULT 'manual',
    "observacoes" TEXT,
    "acordoComercialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContratoArquivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContratoArquivo_b2Key_key" ON "ContratoArquivo"("b2Key");
CREATE UNIQUE INDEX "ContratoArquivo_hashSha256_key" ON "ContratoArquivo"("hashSha256");
CREATE UNIQUE INDEX "ContratoArquivo_acordoComercialId_key" ON "ContratoArquivo"("acordoComercialId");
CREATE INDEX "ContratoArquivo_pessoaId_idx" ON "ContratoArquivo"("pessoaId");
CREATE INDEX "ContratoArquivo_status_idx" ON "ContratoArquivo"("status");
CREATE INDEX "ContratoArquivo_uploadedAt_idx" ON "ContratoArquivo"("uploadedAt" DESC);

-- AddForeignKey
ALTER TABLE "ContratoArquivo"
  ADD CONSTRAINT "ContratoArquivo_pessoaId_fkey"
  FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContratoArquivo"
  ADD CONSTRAINT "ContratoArquivo_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContratoArquivo"
  ADD CONSTRAINT "ContratoArquivo_acordoComercialId_fkey"
  FOREIGN KEY ("acordoComercialId") REFERENCES "AcordoComercial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ContratoExtracao
CREATE TABLE "ContratoExtracao" (
    "id" TEXT NOT NULL,
    "contratoArquivoId" TEXT NOT NULL,
    "modeloIa" TEXT NOT NULL DEFAULT 'claude-opus-4-7',
    "promptVersion" TEXT NOT NULL DEFAULT 'v1',
    "confianca" DOUBLE PRECISION NOT NULL,
    "dadosExtraidos" JSONB NOT NULL,
    "erroExtracao" TEXT,
    "extraidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusRevisao" TEXT NOT NULL DEFAULT 'nao_revisado',
    "revisadoPorId" TEXT,
    "revisadoEm" TIMESTAMP(3),
    "dadosCorrigidos" JSONB,
    "observacoesRevisao" TEXT,

    CONSTRAINT "ContratoExtracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContratoExtracao_contratoArquivoId_idx" ON "ContratoExtracao"("contratoArquivoId");
CREATE INDEX "ContratoExtracao_statusRevisao_idx" ON "ContratoExtracao"("statusRevisao");
CREATE INDEX "ContratoExtracao_extraidoEm_idx" ON "ContratoExtracao"("extraidoEm" DESC);

-- AddForeignKey
ALTER TABLE "ContratoExtracao"
  ADD CONSTRAINT "ContratoExtracao_contratoArquivoId_fkey"
  FOREIGN KEY ("contratoArquivoId") REFERENCES "ContratoArquivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContratoExtracao"
  ADD CONSTRAINT "ContratoExtracao_revisadoPorId_fkey"
  FOREIGN KEY ("revisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
