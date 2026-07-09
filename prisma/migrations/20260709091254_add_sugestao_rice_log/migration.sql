-- Log append-only "Sugerir RICE com IA" (SugestaoRiceLog): tabela NOVA, PURAMENTE
-- ADITIVA — zero impacto em linhas/tabelas existentes.
--
-- NOTA: o `prisma migrate dev` deste schema sempre gera, como falso "drift", um
-- DROP INDEX "PainelEmailAI_tsv_idx" + ALTER COLUMN "tsv" DROP DEFAULT — porque a
-- coluna gerada `tsv` (Unsupported("tsvector")) e o índice GIN não são
-- representáveis no schema.prisma. Essas duas linhas foram REMOVIDAS À MÃO; o FTS
-- de PainelEmailAI permanece intacto.

-- CreateTable
CREATE TABLE "SugestaoRiceLog" (
    "id" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "implementacaoId" TEXT NOT NULL,
    "sugestaoLogId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "usuarioNome" TEXT NOT NULL,
    "reach" INTEGER,
    "impact" INTEGER,
    "confidence" INTEGER,
    "effort" INTEGER,
    "score" DOUBLE PRECISION,
    "confiancaGeral" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SugestaoRiceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SugestaoRiceLog_implementacaoId_createdAt_idx" ON "SugestaoRiceLog"("implementacaoId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SugestaoRiceLog_usuarioId_createdAt_idx" ON "SugestaoRiceLog"("usuarioId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "SugestaoRiceLog" ADD CONSTRAINT "SugestaoRiceLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
