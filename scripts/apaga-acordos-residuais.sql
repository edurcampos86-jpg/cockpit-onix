-- ============================================================================
-- APAGA OS ACORDOS RESIDUAIS POR `tipoProduto`
-- ============================================================================
--
-- DECISÃO DO EDUARDO, 23/08/2026: apagar, não mapear.
--
-- As linhas alvo são as tentativas de cadastro por `tipoProduto` feitas ANTES
-- da mudança de modelo da #385, quando o acordo era por texto de produto e não
-- por nó da hierarquia. Elas nunca geraram pagamento — são resíduo de
-- modelagem, não histórico financeiro.
--
-- Mapeá-las a uma empresa criaria histórico ficcional: afirmaria que alguém
-- decidiu, em janeiro, que aquele acordo pertencia a um nó — e ninguém decidiu.
-- Um `empresaId` inventado num registro de remuneração é pior que registro
-- nenhum, porque o fechamento de comissão não tem como saber que foi chute.
--
-- ── POR QUE ISTO DESTRAVA A #387 ──────────────────────────────────────────
-- A migration da #387 abre com `ALTER COLUMN "empresaId" SET NOT NULL`, que é
-- da COLUNA INTEIRA — não olha vigência. Linha encerrada com `empresaId` nulo
-- barra a migration exatamente como uma linha viva barraria, e com
-- `migrate deploy && next start` isso não vira "migration pendente": vira app
-- em loop de restart (a lição da #301).
--
-- Enquanto `sem_no` não for zero, a #387 não pode entrar.
--
-- ── APAGAR É IRREVERSÍVEL. O QUE SEGURA ───────────────────────────────────
--   * o bloco 1 IMPRIME as linhas antes — e a saída dele vai para o registro
--     em `docs/onix-co-estado.md`, que é o que sobra depois do DELETE;
--   * o bloco 2 ABORTA se não encontrar exatamente 2;
--   * nenhuma tabela referencia `AcordoComercialParceiro` por chave estrangeira
--     (conferido no schema: só existem FKs SAINDO dela, para `Parceiro` e
--     `Empresa`), então o DELETE não arrasta nada junto;
--   * o backup diário roda às 06:00 UTC e o drill de restauração está verde —
--     se algo der errado, o dado de ontem existe.
--
-- ── COMO RODAR ────────────────────────────────────────────────────────────
--   BLOCO 1 — CONFERÊNCIA. Só SELECT. Rode, LEIA, e cole a saída no registro
--             antes de seguir. Depois do bloco 2 essas linhas não existem mais.
--   BLOCO 2 — DELETE. Transação com guarda. Só rode depois do bloco 1.
--
-- Console do Railway → Postgres → Query. Um bloco de cada vez.

-- ============================================================================
-- BLOCO 1 · CONFERÊNCIA  (somente leitura — a saída É o registro)
-- ============================================================================

SELECT
  a.id,
  p.nome        AS parceiro,
  a."tipoProduto",
  a.percentual,
  a."dataInicio",
  a."dataFim",
  a."criadoEm",
  a."criadoPor",
  a."encerradoPor"
FROM "AcordoComercialParceiro" a
JOIN "Parceiro" p ON p.id = a."parceiroId"
WHERE a."dataFim"   IS NOT NULL
  AND a."empresaId" IS NULL
ORDER BY p.nome, a."dataInicio";

-- Confira também que NÃO há linha VIGENTE sem nó. Se esta consulta devolver
-- alguma coisa, PARE: uma linha viva sem nó é outro problema, e apagá-la seria
-- destruir acordo em vigor.
SELECT count(*) AS "vigentes sem no — tem de ser 0"
FROM "AcordoComercialParceiro"
WHERE "dataFim" IS NULL AND "empresaId" IS NULL;

-- @@ FIM DO BLOCO 1 @@

-- ============================================================================
-- BLOCO 2 · DELETE  (transação com guarda — aborta sozinha se algo mudou)
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_alvo   INT;
  v_vivas  INT;
BEGIN
  -- ── Guarda 1 · são exatamente 2 ─────────────────────────────────────────
  SELECT count(*) INTO v_alvo
  FROM "AcordoComercialParceiro"
  WHERE "dataFim" IS NOT NULL AND "empresaId" IS NULL;

  IF v_alvo <> 2 THEN
    RAISE EXCEPTION
      'Esperava 2 acordos residuais, encontrei %. O banco não está no estado que esta limpeza assume — NADA foi apagado.', v_alvo;
  END IF;

  -- ── Guarda 2 · nenhuma linha VIGENTE sem nó ─────────────────────────────
  -- Não é o alvo deste DELETE, mas se existir, o pressuposto "todo resíduo
  -- está encerrado" caiu — e o de-para tem de ser revisto antes de apagar
  -- qualquer coisa.
  SELECT count(*) INTO v_vivas
  FROM "AcordoComercialParceiro"
  WHERE "dataFim" IS NULL AND "empresaId" IS NULL;

  IF v_vivas <> 0 THEN
    RAISE EXCEPTION
      'Há % acordo(s) VIGENTE(S) sem nó. Isso não é resíduo — é acordo em vigor sem empresa. NADA foi apagado.', v_vivas;
  END IF;

  RAISE NOTICE 'Guardas passaram: 2 residuais encerrados, nenhum vigente sem no.';
END $$;

DELETE FROM "AcordoComercialParceiro"
WHERE "dataFim"   IS NOT NULL
  AND "empresaId" IS NULL;

-- ── Confirmação, dentro da mesma transação ────────────────────────────────
-- Depois do DELETE, `sem_no` tem de ser 0 — é a condição que destrava a #387.
SELECT
  count(*)                                    AS acordos,
  count(*) FILTER (WHERE "empresaId" IS NULL) AS sem_no,
  count(*) FILTER (WHERE "dataFim"   IS NULL) AS vigentes
FROM "AcordoComercialParceiro";

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Não há. `DELETE` apaga, e estas linhas não têm de onde ser reconstruídas a
-- não ser do backup — `db-backup.yml`, diário às 06:00 UTC.
--
-- É por isso que o bloco 1 existe e que a saída dele vai para
-- `docs/onix-co-estado.md`: depois daqui, o registro no repositório é a única
-- memória de que essas duas linhas existiram.
