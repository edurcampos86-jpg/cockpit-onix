-- NOTA (entrega segura): removidas 2 linhas de DRIFT do FTS de PainelEmailAI que
-- o Prisma re-emite (coluna "tsv" Unsupported + índice GIN não representável):
--   DROP INDEX "PainelEmailAI_tsv_idx";
--   ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
-- Não tocar o FTS. Ver 20260613120000_painel_email_fts_index_recreate.

-- CreateTable
CREATE TABLE "PessoaEmpresa" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "incluiDescendentes" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PessoaEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PessoaEmpresa_pessoaId_idx" ON "PessoaEmpresa"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "PessoaEmpresa_pessoaId_empresaId_key" ON "PessoaEmpresa"("pessoaId", "empresaId");

-- AddForeignKey
ALTER TABLE "PessoaEmpresa" ADD CONSTRAINT "PessoaEmpresa_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PessoaEmpresa" ADD CONSTRAINT "PessoaEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
