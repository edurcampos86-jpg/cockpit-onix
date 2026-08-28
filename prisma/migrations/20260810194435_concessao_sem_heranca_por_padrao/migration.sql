-- NOTA (entrega segura): removidas 2 linhas de DRIFT do FTS de PainelEmailAI que
-- o Prisma re-emite em TODA migration, porque a coluna "tsv" é
-- Unsupported("tsvector") e o índice GIN "PainelEmailAI_tsv_idx" não é
-- representável no schema.prisma:
--   DROP INDEX "PainelEmailAI_tsv_idx";
--   ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
-- Mantê-las derrubaria o índice de busca e o DEFAULT/GENERATED da coluna em
-- produção. Ver 20260613120000_painel_email_fts_index_recreate.

-- O DEFAULT de `incluiDescendentes` era `true`. Com a hierarquia de 3 níveis,
-- herdar deixou de ser "a leitura intuitiva da holding" e passou a arrastar os
-- departamentos de qualquer empresa concedida — a semântica é a mesma, o
-- alcance dobrou. Num campo de permissão, conceder mais do que foi pedido é a
-- forma errada de errar.
--
-- SÓ O DEFAULT MUDA. Não há UPDATE aqui de propósito: linha existente com
-- `true` foi alguém que escolheu herdar, e reescrever seria revogar acesso sem
-- ninguém pedir. `ALTER COLUMN ... SET DEFAULT` é alteração de catálogo — não
-- reescreve tabela, não pega lock de dado, roda em tempo constante.
--
-- Conferência de quem já tem herança ligada (esperado 0 hoje, PessoaEmpresa
-- está vazia):
--   SELECT count(*) FROM "PessoaEmpresa" WHERE "incluiDescendentes";

-- AlterTable
ALTER TABLE "PessoaEmpresa" ALTER COLUMN "incluiDescendentes" SET DEFAULT false;
