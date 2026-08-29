-- Fixture do ENSAIO B (`.github/workflows/ensaio-migration.yml`).
--
-- NUNCA roda em produção. O `prisma migrate deploy` só executa `migration.sql`;
-- este arquivo é carregado à mão pelo workflow, contra o Postgres descartável
-- do runner, ANTES de a migration ao lado ser aplicada.
--
-- ── POR QUE ELE EXISTE ───────────────────────────────────────────────────
-- Num banco VAZIO, o backfill desta migration copia zero linhas, o bloco de
-- conferência compara 0 com 0, e tudo passa sem tocar em nada. Verde por
-- ausência. Este fixture põe dado onde o backfill vai ler, para o ensaio
-- exercitar o que a migration realmente faz.
--
-- ── O QUE ELE MONTA, E POR QUÊ CADA PEÇA ─────────────────────────────────
--   1. `Empresa('investimentos')` — o nó que o backfill grava em
--      `ParcelaReceita.empresaId`. Sem ele, o INSERT morreria em violação de
--      chave estrangeira; COM ele, o ensaio prova o caminho feliz. O bloco
--      que recusa a ausência tem teste próprio no fim deste arquivo.
--   2. Dois clientes e três linhas de comissão, com CENTAVOS e uma
--      competência repetida entre clientes. Centavos porque o que se quer
--      provar é a soma em DECIMAL: `0.07 * 3` em float8 daria
--      0.21000000000000002, e a conferência da migration reprovaria.
--   3. Um cliente COM comissão em dois meses e outro com um só — para a
--      contagem não coincidir com o número de clientes por acidente.

INSERT INTO "Empresa" ("id", "nome", "tipo", "createdAt", "updatedAt")
VALUES ('investimentos', 'Onix Capital', 'empresa', now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ClienteBackoffice" ("id", "nome", "numeroConta", "createdAt", "updatedAt")
VALUES
  ('ensaio-cli-1', 'Cliente Ensaio Um',  '900001', now(), now()),
  ('ensaio-cli-2', 'Cliente Ensaio Dois', '900002', now(), now())
ON CONFLICT ("id") DO NOTHING;

-- 1.234,56 + 0,07 + 987,65 = 2.222,28 exatos em DECIMAL(14,2).
-- Em float8 a soma sai 2222.2799999999997 e a conferência da migration
-- reprovaria — que é exatamente o que se quer que ela faça se alguém trocar
-- o tipo da coluna um dia.
INSERT INTO "ComissaoMensalCliente"
  ("id", "clienteId", "competencia", "comissao", "fonte", "importadoEm", "criadoEm", "atualizadoEm")
VALUES
  ('ensaio-com-1', 'ensaio-cli-1', '2026-07', 1234.56, 'btg_rm_reports', now(), now(), now()),
  ('ensaio-com-2', 'ensaio-cli-1', '2026-08',    0.07, 'btg_rm_reports', now(), now(), now()),
  ('ensaio-com-3', 'ensaio-cli-2', '2026-08',  987.65, 'btg_rm_reports', now(), now(), now());

-- O que a migration TEM de produzir a partir daqui:
--   3 linhas em ParcelaReceita, origem 'apuracao', empresaId 'investimentos'
--   soma de valorLiquido = 2222.28
-- Se não bater, o bloco DO $$ da migration levanta EXCEPTION com os quatro
-- números e a transação inteira reverte — sem deixar tabela pela metade.
