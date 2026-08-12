-- Árvore de parceiros + guarda anti-ciclo NO BANCO — migration 100% ADITIVA.
--
-- Acrescenta TRÊS colunas nullable a "Parceiro" (self-relation + vigência) e
-- cria UMA função + UM trigger. Nenhum DROP de dado, nenhum NOT NULL em coluna
-- existente, nenhum rename, nenhuma coluna existente alterada.
--
-- "indicadoPorParceiroId" espelha "Empresa"."parentId" (20260807114022) na
-- forma, mas NÃO no regime: a hierarquia de Empresa tem teto decretado
-- (PROFUNDIDADE_MAXIMA = 2, src/lib/empresas/hierarquia.ts) e ~5 nós, então a
-- travessia dela mora em TypeScript puro — descendentesDe() em
-- src/lib/empresas/acesso-core.ts, BFS com Set de vistos. Aqui a profundidade
-- é ILIMITADA por decisão de negócio e a árvore cresce com a rede.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE A GUARDA ANTI-CICLO É TRIGGER, e não código de aplicação
-- ─────────────────────────────────────────────────────────────────────────
-- Um ciclo (A→B→A) transforma toda travessia da árvore em laço infinito:
-- soma de AUM de subárvore, cálculo de comissão, render de organograma. O
-- processo não devolve erro — ele para de responder.
--
-- Validar isso na aplicação protegeria APENAS o caminho que passa pela
-- aplicação. Import de planilha, script de backfill, correção manual por SQL e
-- qualquer rota futura escrita distraidamente passam por fora. A regra é
-- estrutural, então mora onde nenhuma escrita escapa dela.
--
-- Postgres não expressa isso em CHECK (a verificação é recursiva e olha outras
-- linhas), então é trigger BEFORE INSERT OR UPDATE.
--
-- A função sobe a cadeia de ancestrais a partir do pai proposto e recusa se
-- reencontrar a própria linha. Detalhes que importam:
--
--   * UNION (não UNION ALL) na CTE recursiva: se o banco JÁ tiver um ciclo
--     — inserido antes deste trigger existir, por exemplo — UNION ALL rodaria
--     para sempre dentro da própria checagem, trocando um laço por outro. Com
--     UNION, a linha repetida é descartada e a recursão termina.
--
--   * A CTE projeta só (id, pai): manter uma coluna de nível quebraria o
--     dedupe do UNION, porque o nível difere a cada volta.
--
--   * ERRCODE 'check_violation' (23514) para que o erro chegue no app como
--     violação de constraint e não como falha genérica de plpgsql.
--
-- É a PRIMEIRA CTE recursiva do repositório — não havia nenhum WITH RECURSIVE
-- antes desta migration. Ela vive aqui dentro, e não numa query de leitura,
-- de propósito: a leitura da árvore segue livre para ser escrita em TS puro e
-- testada sem banco, no precedente de acesso-core.ts.
--
-- VIGÊNCIA em colunas ("indicadoPorDesde"/"indicadoPorAte", NULL = vigente)
-- e não em tabela de histórico: cada parceiro tem no máximo UM pai por vez.
-- Custo assumido: trocar de pai sobrescreve o vínculo anterior em vez de
-- arquivá-lo. Se histórico de reparenting virar requisito, vira tabela própria.
--
-- SEM BACKFILL: toda linha de "Parceiro" (a tabela nasceu vazia em
-- 20260811091625) fica com os três campos NULL, e NADA no app os lê.
--
-- Rollback = DROP TRIGGER "parceiro_sem_ciclo_trg" ON "Parceiro";
--            DROP FUNCTION parceiro_sem_ciclo();
--            ALTER TABLE "Parceiro" DROP CONSTRAINT "Parceiro_indicadoPorParceiroId_fkey";
--            DROP INDEX "Parceiro_indicadoPorParceiroId_idx";
--            ALTER TABLE "Parceiro" DROP COLUMN "indicadoPorParceiroId",
--              DROP COLUMN "indicadoPorDesde", DROP COLUMN "indicadoPorAte";
--
-- ATENÇÃO: o `prisma migrate dev` gerou aqui 2 statements de drift sobre
-- PainelEmailAI.tsv, REMOVIDOS À MÃO:
--
--     DROP INDEX "PainelEmailAI_tsv_idx";
--     ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
--
-- Eles não pertencem a esta migration e o DROP INDEX destruiria o índice FTS
-- de produção. Causa conhecida e recorrente: coluna gerada em SQL bruto
-- (20260519240000) declarada como Unsupported("tsvector") no schema. É a
-- SÉTIMA migration seguida com a mesma remoção manual — ver 20260806083819,
-- 20260807114022, 20260808210618, 20260810182055, 20260811091625 e
-- 20260811092122.

-- AlterTable
ALTER TABLE "Parceiro" ADD COLUMN     "indicadoPorAte" TIMESTAMP(3),
ADD COLUMN     "indicadoPorDesde" TIMESTAMP(3),
ADD COLUMN     "indicadoPorParceiroId" TEXT;

-- CreateIndex
CREATE INDEX "Parceiro_indicadoPorParceiroId_idx" ON "Parceiro"("indicadoPorParceiroId");

-- AddForeignKey
ALTER TABLE "Parceiro" ADD CONSTRAINT "Parceiro_indicadoPorParceiroId_fkey" FOREIGN KEY ("indicadoPorParceiroId") REFERENCES "Parceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Guarda anti-ciclo. Ver o bloco de comentário no topo.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION parceiro_sem_ciclo() RETURNS trigger AS $$
BEGIN
  -- Raiz: nada a verificar.
  IF NEW."indicadoPorParceiroId" IS NULL THEN
    RETURN NEW;
  END IF;

  -- Auto-referência (A→A). Barrada à parte porque a CTE abaixo parte do PAI,
  -- e com pai = a própria linha ela não chegaria a dar a primeira volta.
  IF NEW."indicadoPorParceiroId" = NEW."id" THEN
    RAISE EXCEPTION 'Ciclo na arvore de parceiros: % nao pode indicar a si mesmo', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;

  -- Sobe a cadeia a partir do pai proposto. Reencontrar NEW.id significa que
  -- o pai já está ABAIXO desta linha na árvore — ligar os dois fecharia o laço.
  IF EXISTS (
    WITH RECURSIVE ancestrais(id, pai) AS (
      SELECT p."id", p."indicadoPorParceiroId"
        FROM "Parceiro" p
       WHERE p."id" = NEW."indicadoPorParceiroId"
      UNION  -- dedupe: termina mesmo se a base já contiver um ciclo
      SELECT p."id", p."indicadoPorParceiroId"
        FROM "Parceiro" p
        JOIN ancestrais a ON p."id" = a.pai
    )
    SELECT 1 FROM ancestrais WHERE id = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Ciclo na arvore de parceiros: % nao pode ser indicado por % (o segundo ja descende do primeiro)',
      NEW."id", NEW."indicadoPorParceiroId"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Só dispara quando o vínculo de árvore é definido ou muda — UPDATE de nome,
-- tipo ou vigência não paga o custo da travessia.
CREATE TRIGGER "parceiro_sem_ciclo_trg"
  BEFORE INSERT OR UPDATE OF "indicadoPorParceiroId" ON "Parceiro"
  FOR EACH ROW
  EXECUTE FUNCTION parceiro_sem_ciclo();
