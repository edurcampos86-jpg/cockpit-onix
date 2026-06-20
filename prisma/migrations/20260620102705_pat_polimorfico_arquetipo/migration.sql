-- NOTA (entrega segura): removidas 2 linhas de DRIFT do FTS de PainelEmailAI que
-- o Prisma re-emite (coluna "tsv" Unsupported + índice GIN não representável):
--   DROP INDEX "PainelEmailAI_tsv_idx";
--   ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
-- Não tocar o FTS. Ver 20260613120000_painel_email_fts_index_recreate.

-- AlterTable
ALTER TABLE "Pat" ADD COLUMN     "arquetipoCodigo" INTEGER,
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "vigente" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "pessoaId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Arquetipo" (
    "codigo" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "Arquetipo_pkey" PRIMARY KEY ("codigo")
);

-- CreateIndex
CREATE INDEX "Pat_clienteId_dataPat_idx" ON "Pat"("clienteId", "dataPat");

-- AddForeignKey
ALTER TABLE "Pat" ADD CONSTRAINT "Pat_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pat" ADD CONSTRAINT "Pat_arquetipoCodigo_fkey" FOREIGN KEY ("arquetipoCodigo") REFERENCES "Arquetipo"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- SQL MANUAL (não gerado pelo Prisma) — escopo PR2.
-- ⚠️ DRIFT FUTURO: o CHECK e os índices parciais abaixo NÃO são representáveis
-- no schema.prisma (Prisma 7), então TODO `migrate dev` futuro vai re-emitir
-- DROPs deles — removê-los à mão, igual ao FTS. Trade-off aceito: integridade
-- garantida no banco (preferência do Eduardo).
-- ============================================================================

-- Seed inicial do catálogo de arquétipos (código+nome do cabeçalho do PAT).
-- Tabela extensível: novos códigos entram ao importar mais PATs.
INSERT INTO "Arquetipo" ("codigo", "nome") VALUES
  (76,  'Promocional de Ação Livre'),
  (22,  'Projetista Criativo'),
  (84,  'Conselheiro Ponderado'),
  (118, 'Intro-Diligente Livre'),
  (30,  'Analítico Estratégico'),
  (16,  'Inovador Social');

-- XOR do sujeito: exatamente UM de pessoaId/clienteId preenchido.
-- Pats de equipe existentes (pessoaId preenchido, clienteId NULL) satisfazem (1+0=1).
ALTER TABLE "Pat" ADD CONSTRAINT "Pat_sujeito_xor"
  CHECK ((("pessoaId" IS NOT NULL)::int + ("clienteId" IS NOT NULL)::int) = 1);

-- Vigência: no máx. 1 PAT vigente por sujeito. Índices parciais únicos —
-- só linhas vigente=true entram; as existentes (vigente=false default) não colidem.
CREATE UNIQUE INDEX "Pat_pessoa_vigente_key"
  ON "Pat" ("pessoaId") WHERE "vigente" = true AND "pessoaId" IS NOT NULL;
CREATE UNIQUE INDEX "Pat_cliente_vigente_key"
  ON "Pat" ("clienteId") WHERE "vigente" = true AND "clienteId" IS NOT NULL;
