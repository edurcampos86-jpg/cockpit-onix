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

-- ── VOLUME, PARA O TEMPO MEDIDO SIGNIFICAR ALGUMA COISA ──────────────────
--
-- Os três registros acima provam a ARITMÉTICA. Não provam nada sobre TEMPO:
-- com 97 linhas no banco, qualquer migration passa em 1 segundo.
--
-- E tempo importa aqui mais do que na maioria dos projetos: `prisma migrate
-- deploy` roda dentro do `startCommand`, então o tempo da migration é tempo de
-- SITE FORA DO AR a cada deploy. Um `ALTER TABLE` que reescreve tabela passa
-- em milissegundos num banco vazio e trava minutos nas 2.716 linhas reais de
-- `ClienteBackoffice`.
--
-- Então o fixture infla até a ordem de grandeza da produção:
--   3.000 clientes  (produção tinha 2.716 em 28/08)
--   9.000 comissões (3 competências por cliente)
--
-- As chaves estrangeiras que esta migration acrescenta apontam para
-- `ClienteBackoffice`, `Empresa`, `Parceiro`, `Pessoa`, `PessoaGrupo` e
-- `ContratoCorretora` — e cada uma pega SHARE ROW EXCLUSIVE na tabela apontada
-- e instala um gatilho. Com a tabela cheia, isso deixa de ser instantâneo.
--
-- O backfill também deixa de ser trivial: passa a copiar 9.003 linhas, e o
-- bloco de conferência a somar 9.003 valores em DECIMAL.

INSERT INTO "ClienteBackoffice" ("id", "nome", "numeroConta", "createdAt", "updatedAt")
SELECT 'ensaio-vol-' || i,
       'Cliente Volume ' || i,
       '95' || lpad(i::text, 6, '0'),
       now(), now()
FROM generate_series(1, 3000) AS i;

-- 1,00 exato por linha: 9.000 linhas somam 9.000,00 em DECIMAL, e com os três
-- registros de centavos acima o total fica 11.222,28. Se algum dia alguém
-- trocar a coluna para float8, a conferência da migration reprova aqui — que é
-- o serviço que ela presta.
INSERT INTO "ComissaoMensalCliente"
  ("id", "clienteId", "competencia", "comissao", "fonte", "importadoEm", "criadoEm", "atualizadoEm")
SELECT 'ensaio-vol-' || i || '-' || m,
       'ensaio-vol-' || i,
       '2026-' || lpad(m::text, 2, '0'),
       1.00,
       'btg_rm_reports',
       now(), now(), now()
FROM generate_series(1, 3000) AS i, generate_series(1, 3) AS m;

-- O que a migration TEM de produzir a partir daqui:
--   9.003 linhas em ParcelaReceita, origem 'apuracao', empresaId 'investimentos'
--   soma de valorLiquido = 11222.28  (2.222,28 dos centavos + 9.000,00 do volume)
-- Se não bater, o bloco DO $$ da migration levanta EXCEPTION com os quatro
-- números e a transação inteira reverte — sem deixar tabela pela metade.
