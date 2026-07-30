-- ClienteBackoffice.feeFixo — marcação manual de "cliente com honorário fixo".
--
-- Aditivo e não-destrutivo: `receitaAnual` PERMANECE no schema e no banco. Só a
-- COLUNA da tabela de /empresas/investimentos/clientes é que passa a mostrar o
-- fee no lugar da receita. O dado de receita segue alimentando /performance, o
-- dashboard, o recálculo em /api/backoffice/receita e o enrich do BTG.
--
-- DEFAULT false + NOT NULL: as ~2.683 linhas existentes recebem `false` no
-- ALTER (Postgres 11+ não reescreve a tabela para default constante), então a
-- migration é rápida e não precisa de backfill.
--
-- Nota de manutenção: o diff automático do Prisma também propõe
-- `DROP INDEX "PainelEmailAI_tsv_idx"` e
-- `ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT` — drift
-- conhecido (coluna GENERATED + índice full-text criados por SQL cru, não
-- representáveis no schema.prisma). Os dois foram REMOVIDOS desta migration de
-- propósito; aplicá-los quebraria a busca do Painel do Dia.

-- AlterTable
ALTER TABLE "ClienteBackoffice" ADD COLUMN "feeFixo" BOOLEAN NOT NULL DEFAULT false;
