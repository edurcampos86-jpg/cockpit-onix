-- Recria o indice FTS "PainelEmailAI_tsv_idx" (GIN sobre a coluna gerada "tsv"),
-- que sumiu de PRODUCAO. O indice foi criado originalmente em
-- 20260519240000_painel_email_ai_fts, mas como a coluna "tsv" e Unsupported("tsvector")
-- no schema.prisma e o indice GIN nao e representavel pelo Prisma, qualquer
-- `prisma db push` / `migrate dev` apontado pra prod o derruba como "drift".
-- Reconciliacao read-only de 13/06/2026 confirmou: coluna "tsv" presente, indice ausente.
--
-- CONCURRENTLY: nao bloqueia INSERT/UPDATE/DELETE na tabela durante o build do indice
--   (PainelEmailAI tem milhares de linhas; evita travar o Painel do Dia em producao).
-- CREATE INDEX CONCURRENTLY NAO pode rodar dentro de um bloco de transacao.
--   O Prisma Migrate aplica cada migration SEM envolve-la em transacao, e este
--   arquivo contem um UNICO statement -> seguro. Por isso esta isolado em migration propria.
-- IF NOT EXISTS: idempotente; vira no-op se o indice ja existir (nao quebra o deploy).

CREATE INDEX CONCURRENTLY IF NOT EXISTS "PainelEmailAI_tsv_idx"
  ON "PainelEmailAI" USING GIN ("tsv");
