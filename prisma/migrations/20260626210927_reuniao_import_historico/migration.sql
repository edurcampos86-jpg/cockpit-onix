-- Histórico de importações de reunião (texto/PDF). Aditivo: cria 1 tabela nova,
-- não toca dados existentes. (Removidas à mão as linhas de drift do índice FTS
-- `PainelEmailAI_tsv_idx` / `tsv` que o `prisma migrate dev` injeta por ser
-- coluna gerada out-of-band, fora do schema.prisma.)
-- CreateTable
CREATE TABLE "ReuniaoImport" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "reuniaoEstruturadaId" TEXT,
    "fonte" TEXT NOT NULL,
    "textoBruto" TEXT,
    "nomeArquivo" TEXT,
    "b2Key" TEXT,
    "contentType" TEXT,
    "tamanhoBytes" INTEGER,
    "importadoPor" TEXT,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReuniaoImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReuniaoImport_clienteId_importadoEm_idx" ON "ReuniaoImport"("clienteId", "importadoEm");

-- AddForeignKey
ALTER TABLE "ReuniaoImport" ADD CONSTRAINT "ReuniaoImport_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReuniaoImport" ADD CONSTRAINT "ReuniaoImport_reuniaoEstruturadaId_fkey" FOREIGN KEY ("reuniaoEstruturadaId") REFERENCES "ReuniaoEstruturada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
