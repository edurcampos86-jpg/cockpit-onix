-- NOTA (entrega segura): removidas 2 linhas de DRIFT do FTS de PainelEmailAI que
-- o Prisma re-emite em TODA migration, porque a coluna "tsv" é
-- Unsupported("tsvector") e o índice GIN "PainelEmailAI_tsv_idx" não é
-- representável no schema.prisma:
--   DROP INDEX "PainelEmailAI_tsv_idx";
--   ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
-- Mantê-las derrubaria o índice de busca e o DEFAULT/GENERATED da coluna em
-- produção. Ver 20260613120000_painel_email_fts_index_recreate.

-- AlterTable
ALTER TABLE "InteracaoCliente" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "pessoaId" TEXT,
ADD COLUMN     "reuniaoEstruturadaId" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "ReuniaoEstruturada" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pessoaId" TEXT,
    "reuniaoClienteId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "tipoCadencia" TEXT,
    "pautas" JSONB,
    "pendencias" JSONB,
    "proximosPassos" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReuniaoEstruturada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReuniaoEstruturada_clienteId_data_idx" ON "ReuniaoEstruturada"("clienteId", "data");

-- CreateIndex
CREATE INDEX "ReuniaoEstruturada_data_idx" ON "ReuniaoEstruturada"("data");

-- AddForeignKey
ALTER TABLE "ReuniaoEstruturada" ADD CONSTRAINT "ReuniaoEstruturada_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReuniaoEstruturada" ADD CONSTRAINT "ReuniaoEstruturada_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReuniaoEstruturada" ADD CONSTRAINT "ReuniaoEstruturada_reuniaoClienteId_fkey" FOREIGN KEY ("reuniaoClienteId") REFERENCES "ReuniaoCliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteracaoCliente" ADD CONSTRAINT "InteracaoCliente_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteracaoCliente" ADD CONSTRAINT "InteracaoCliente_reuniaoEstruturadaId_fkey" FOREIGN KEY ("reuniaoEstruturadaId") REFERENCES "ReuniaoEstruturada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
