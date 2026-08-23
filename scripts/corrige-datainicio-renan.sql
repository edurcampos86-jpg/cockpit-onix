-- ============================================================================
-- CORREÇÃO DE DATA DIGITADA — dataInicio dos 4 acordos do Renan
-- ============================================================================
--
-- O QUE ACONTECEU
-- Os 4 acordos por nó do Renan Afonso de Paula (Onix Investimentos, Corretora,
-- Tech e Educação, 20% cada, `incluiDescendentes` ligado) foram cadastrados
-- pela tela com `dataInicio = 23/01/2026`. O correto é 01/01/2026. Foi erro de
-- digitação no formulário — o acordo sempre valeu desde o dia 1º.
--
-- POR QUE É UPDATE, E NÃO FECHAR-E-ABRIR
-- A regra da casa "alterar um acordo FECHA o vigente e ABRE outro" existe para
-- mudança de PERCENTUAL: 20% até uma data e 25% depois são dois fatos, e o
-- histórico tem de guardar os dois.
--
-- Correção de data digitada é o oposto disso: não houve dois fatos. Fechar-e-
-- abrir aqui inventaria um acordo que teria passado a valer em 23/01 — um
-- evento que nunca existiu — e qualquer fechamento de comissão que lesse o
-- histórico veria uma troca de regra no meio de janeiro.
--
-- O registro errado é o que está no banco. Corrigir é apagá-lo, não empilhar
-- outro por cima.
--
-- ============================================================================
-- COMO RODAR — dois blocos, nesta ordem
-- ============================================================================
--
--   BLOCO 1 — CONFERÊNCIA. Só SELECT. Rode, leia, confira que são as 4 linhas
--             que você espera. Não escreve nada.
--
--   BLOCO 2 — CORREÇÃO. Uma transação com guardas que ABORTAM sozinhas se o
--             banco não estiver no estado esperado. Só rode depois de ler o
--             bloco 1.
--
-- Console do Railway → Postgres → Query. Cole um bloco de cada vez.
--
-- ============================================================================
-- AUDITORIA — a limitação, dita na cara
-- ============================================================================
-- `AcordoComercialParceiro` tem `criadoPor` e `encerradoPor`, e NÃO tem
-- `atualizadoPor`. Não existe tabela de log para correção de dado — a que
-- chega mais perto, `ConfigAudit`, é de flags de configuração e usá-la aqui
-- seria desvio de propósito.
--
-- Então o "quando" fica NO DADO: o UPDATE grava `atualizadoEm = now()`
-- explicitamente, porque `@updatedAt` é do Prisma e SQL cru não o dispara.
--
-- E o "quem" fica FORA do dado: nesta PR, no commit, e em
-- `docs/onix-co-estado.md`. O bloco 2 exige a variável `quem` e a imprime na
-- saída — cole a saída no registro.
--
-- Isto é uma lacuna real, não um detalhe: a próxima correção de dado terá o
-- mesmo problema. Ver a sugestão de tabela de correções no relatório.

-- ============================================================================
-- BLOCO 1 · CONFERÊNCIA  (somente leitura)
-- ============================================================================

SELECT
  a.id,
  p.nome                    AS parceiro,
  e.nome                    AS no,
  a."tipoProduto",
  a.percentual,
  a."incluiDescendentes",
  a."dataInicio",
  a."dataFim",
  a."criadoEm"
FROM "AcordoComercialParceiro" a
JOIN "Parceiro" p ON p.id = a."parceiroId"
LEFT JOIN "Empresa" e ON e.id = a."empresaId"
WHERE p.nome = 'Renan Afonso de Paula'
ORDER BY a."dataFim" NULLS FIRST, e.nome;

-- ============================================================================
-- BLOCO 2 · CORREÇÃO  (transação com guardas — aborta sozinha se algo mudou)
-- ============================================================================

-- Só SQL — nenhum comando de barra invertida. O console do Railway não é o
-- psql interativo e engasgaria em `\set`.
--
-- ↓↓↓ TROQUE pelo seu email antes de rodar. Ele sai na saída, e é a saída que
--     vai para o registro de auditoria em docs/onix-co-estado.md.
SELECT 'PREENCHER: email de quem esta corrigindo' AS "responsavel pela correcao";

BEGIN;

DO $$
DECLARE
  v_parceiro TEXT;
  v_alvo     INT;
BEGIN
  -- ── Guarda 1 · o parceiro é exatamente um ───────────────────────────────
  -- `Parceiro.nome` não é @unique. Dois "Renan" e o UPDATE pegaria os dois.
  SELECT id INTO STRICT v_parceiro
  FROM "Parceiro"
  WHERE nome = 'Renan Afonso de Paula';
  -- INTO STRICT levanta NO_DATA_FOUND / TOO_MANY_ROWS sozinho.

  -- ── Guarda 2 · são exatamente 4 linhas ──────────────────────────────────
  SELECT count(*) INTO v_alvo
  FROM "AcordoComercialParceiro"
  WHERE "parceiroId"  = v_parceiro
    AND "dataFim"     IS NULL
    AND "empresaId"   IS NOT NULL
    AND "dataInicio" >= TIMESTAMP '2026-01-23 00:00:00'
    AND "dataInicio"  < TIMESTAMP '2026-01-24 00:00:00';

  IF v_alvo <> 4 THEN
    RAISE EXCEPTION
      'Esperava 4 acordos a corrigir, encontrei %. O banco não está no estado que esta correção assume — NADA foi alterado.', v_alvo;
  END IF;

  RAISE NOTICE 'Guardas passaram: 4 acordos vigentes por no, parceiro %.', v_parceiro;
END $$;

-- ── O UPDATE ──────────────────────────────────────────────────────────────
--
-- Três coisas no WHERE, cada uma fazendo trabalho:
--
--   `dataFim IS NULL`     só o que está vigente. Linha encerrada é histórico
--                         fechado e não se mexe.
--
--   `empresaId IS NOT NULL`  só os 4 acordos POR NÓ. As linhas antigas por
--                         `tipoProduto` têm `empresaId` nulo e ficam de fora —
--                         sem isto, uma delas com a mesma data entraria junto.
--
--   janela do dia 23      e NÃO `= '2026-01-23'`. A tela grava data pura como
--                         MEIO-DIA UTC (`dataOuNula`, actions/parceiros.ts:30),
--                         então o valor no banco é `2026-01-23 12:00:00` e a
--                         igualdade com a meia-noite casaria ZERO linhas.
--
-- E o valor novo é `12:00`, não `00:00`, pela mesma razão: meia-noite UTC cai
-- no dia anterior em qualquer fuso a oeste, e a ficha passaria a mostrar
-- 31/12/2025.
UPDATE "AcordoComercialParceiro" a
SET "dataInicio"   = TIMESTAMP '2026-01-01 12:00:00',
    -- `@updatedAt` é do Prisma: SQL cru não o dispara, e sem esta linha o
    -- carimbo continuaria marcando a digitação errada.
    "atualizadoEm" = now()
FROM "Parceiro" p
WHERE p.id = a."parceiroId"
  AND p.nome          = 'Renan Afonso de Paula'
  AND a."dataFim"     IS NULL
  AND a."empresaId"   IS NOT NULL
  AND a."dataInicio" >= TIMESTAMP '2026-01-23 00:00:00'
  AND a."dataInicio"  < TIMESTAMP '2026-01-24 00:00:00';

-- ── Confirmação, dentro da mesma transação ────────────────────────────────
SELECT
  e.nome        AS no,
  a.percentual,
  a."dataInicio",
  a."atualizadoEm"
FROM "AcordoComercialParceiro" a
JOIN "Parceiro" p ON p.id = a."parceiroId"
JOIN "Empresa"  e ON e.id = a."empresaId"
WHERE p.nome = 'Renan Afonso de Paula'
  AND a."dataFim" IS NULL
ORDER BY e.nome;

COMMIT;

-- ============================================================================
-- ROLLBACK, se der errado depois do COMMIT
-- ============================================================================
-- Não há linha a restaurar — o UPDATE não apagou nada, só mudou uma data. Para
-- voltar, o mesmo comando com as datas invertidas:
--
--   UPDATE "AcordoComercialParceiro" a
--   SET "dataInicio" = TIMESTAMP '2026-01-23 12:00:00', "atualizadoEm" = now()
--   FROM "Parceiro" p
--   WHERE p.id = a."parceiroId" AND p.nome = 'Renan Afonso de Paula'
--     AND a."dataFim" IS NULL AND a."empresaId" IS NOT NULL
--     AND a."dataInicio" = TIMESTAMP '2026-01-01 12:00:00';
