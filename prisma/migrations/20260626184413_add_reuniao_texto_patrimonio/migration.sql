-- AlterTable: campos aditivos opcionais para captura de reunião via IA (import do Plaud).
-- Ambas as colunas são NULL-able e sem backfill → não tocam dados existentes.
-- (Removidas à mão as linhas de drift do índice FTS `PainelEmailAI_tsv_idx` /
--  `tsv` que o `prisma migrate dev` injeta em TODA migration por ser coluna gerada
--  out-of-band, fora do schema.prisma.)
ALTER TABLE "ReuniaoEstruturada" ADD COLUMN     "patrimonioSnapshot" JSONB,
ADD COLUMN     "textoBruto" TEXT;
