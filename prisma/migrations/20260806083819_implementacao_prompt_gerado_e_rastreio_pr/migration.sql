-- Fluxo guiado de implementação — migration 100% ADITIVA.
--
-- Todas as colunas são nullable, sem default e sem backfill: nenhuma linha
-- existente é lida ou reescrita, então não há janela de bloqueio nem caminho
-- de perda de dado. Rollback = DROP das 7 colunas.
--
-- "como" segue NULLABLE de propósito. A obrigatoriedade do campo é regra de
-- PRODUTO (aplicada na Server Action para submissão nova), não invariante de
-- storage: as sugestões anteriores ao fluxo guiado legitimamente não têm um
-- "como", e preencher placeholder aqui inventaria dado indistinguível de
-- resposta real — inclusive para a IA, que lê o campo como contexto.
--
-- NOTA: o `prisma migrate dev` gerou aqui 2 statements de drift sobre
-- PainelEmailAI.tsv (DROP INDEX do FTS + ALTER DROP DEFAULT) porque a coluna
-- gerada vive em SQL bruto (20260519240000) e o schema declara
-- Unsupported("tsvector"). Foram REMOVIDOS à mão: não pertencem a esta
-- migration e o DROP INDEX destruiria o índice FTS de produção.

-- AlterTable
ALTER TABLE "Implementacao" ADD COLUMN     "conversaIA" JSONB,
ADD COLUMN     "prMergedAt" TIMESTAMP(3),
ADD COLUMN     "prNumero" INTEGER,
ADD COLUMN     "prStatus" TEXT,
ADD COLUMN     "prUrl" TEXT,
ADD COLUMN     "promptGerado" TEXT,
ADD COLUMN     "versaoTemplate" INTEGER;
