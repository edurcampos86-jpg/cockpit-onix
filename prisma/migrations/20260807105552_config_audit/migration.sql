-- NOTA (entrega segura): removidas 2 linhas de DRIFT do FTS de PainelEmailAI que
-- o Prisma re-emite (coluna "tsv" Unsupported + índice GIN não representável):
--   DROP INDEX "PainelEmailAI_tsv_idx";
--   ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
-- Não tocar o FTS. Ver 20260613120000_painel_email_fts_index_recreate.

-- CreateTable
CREATE TABLE "ConfigAudit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT NOT NULL,
    "quemId" TEXT,
    "quemEmail" TEXT,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfigAudit_key_quando_idx" ON "ConfigAudit"("key", "quando" DESC);

-- CreateIndex
CREATE INDEX "ConfigAudit_quando_idx" ON "ConfigAudit"("quando" DESC);
