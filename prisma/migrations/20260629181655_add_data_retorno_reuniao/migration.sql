-- Slot próprio para a próxima data de retorno / próxima reunião (a mais próxima).
-- Aditiva e nullable: zero impacto nas linhas existentes (todas ficam NULL).
--
-- NOTA: o `prisma migrate dev` deste schema sempre gera, como falso "drift", um
-- DROP INDEX "PainelEmailAI_tsv_idx" + ALTER COLUMN "tsv" DROP DEFAULT — porque a
-- coluna gerada `tsv` (Unsupported("tsvector")) e o índice GIN não são
-- representáveis no schema.prisma. Essas duas linhas foram REMOVIDAS À MÃO; esta
-- migration é PURAMENTE ADITIVA e o FTS de PainelEmailAI permanece intacto.

-- AlterTable
ALTER TABLE "ReuniaoEstruturada" ADD COLUMN     "dataRetorno" TIMESTAMP(3);
