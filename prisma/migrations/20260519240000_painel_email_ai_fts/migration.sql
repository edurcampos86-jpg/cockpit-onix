-- Busca full-text em PainelEmailAI para o bloco "Busca semantica" do Painel do Dia.
-- Coluna gerada (STORED) com tsvector portugues sobre assunto + snippet + remetente.
-- Indice GIN garante busca em O(log n) mesmo com 9k+ linhas (~6 meses de email).
-- Usamos raw SQL (prisma.$queryRaw) porque o Prisma 7 nao expoe tsvector como tipo
-- nativo; a coluna existe no Postgres mas e opaca pro client (Unsupported() ou
-- omitida da schema).

ALTER TABLE "PainelEmailAI"
  ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'portuguese',
      coalesce("assunto", '') || ' ' ||
      coalesce("snippet", '') || ' ' ||
      coalesce("remetente", '')
    )
  ) STORED;

CREATE INDEX "PainelEmailAI_tsv_idx" ON "PainelEmailAI" USING GIN ("tsv");
