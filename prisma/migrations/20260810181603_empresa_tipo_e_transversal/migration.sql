-- NOTA (entrega segura): removidas 2 linhas de DRIFT do FTS de PainelEmailAI que
-- o Prisma re-emite em TODA migration, porque a coluna "tsv" é
-- Unsupported("tsvector") e o índice GIN "PainelEmailAI_tsv_idx" não é
-- representável no schema.prisma:
--   DROP INDEX "PainelEmailAI_tsv_idx";
--   ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
-- Mantê-las derrubaria o índice de busca e o DEFAULT/GENERATED da coluna em
-- produção. Ver 20260613120000_painel_email_fts_index_recreate.

-- ATENÇÃO — ESTA MIGRATION FALHA DE PROPÓSITO SE "Empresa" TIVER LINHAS.
--
-- `ADD COLUMN "tipo" NOT NULL` sem DEFAULT é rejeitado pelo Postgres em tabela
-- não-vazia. Isso é o GUARD, não um descuido: o papel de cada nó (holding,
-- empresa, departamento) é decisão, e um DEFAULT faria toda linha preexistente
-- nascer com um papel que ninguém escolheu — provavelmente o errado, já que a
-- estrutura mudou de 2 para 3 níveis nesta PR.
--
-- A premissa é que `Empresa` está VAZIA em produção (RBAC inerte: a auditoria
-- em /api/configuracoes/permissoes/auditoria reporta `rbacInerte: true` quando
-- a contagem é 0). Se a premissa não valer, o deploy para aqui em vez de
-- rotular 6 linhas por chute — e o conserto é decidir o `tipo` de cada linha
-- existente ANTES, num UPDATE conferido à mão.
--
-- Conferência antes de aplicar:
--   SELECT count(*) FROM "Empresa";   -- esperado: 0

-- CreateEnum
CREATE TYPE "TipoNo" AS ENUM ('holding', 'empresa', 'departamento');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "tipo" "TipoNo" NOT NULL,
ADD COLUMN     "transversal" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Empresa_transversal_idx" ON "Empresa"("transversal");
