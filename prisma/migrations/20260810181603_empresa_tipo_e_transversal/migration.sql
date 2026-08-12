-- Empresa.tipo e Empresa.transversal — em TRÊS FASES, porque a tabela TEM DADO.
--
-- ── POR QUE NÃO É `ADD COLUMN NOT NULL` DIRETO ───────────────────────────
-- A versão anterior desta migration adicionava `tipo` como NOT NULL sem
-- DEFAULT, de propósito: sem linhas, funciona; com linhas, o Postgres recusa
-- (23502) e ninguém rotula nada por chute.
--
-- A medição em produção (2026-08-12, GitHub Actions read-only) mostrou que a
-- premissa estava ERRADA — `Empresa` tem 6 linhas:
--
--     onix-co        (raiz)        Onix Co
--     corporate      pai=onix-co   Onix Corporate
--     corretora      pai=onix-co   Onix Corretora
--     imobiliaria    pai=onix-co   Onix Imobiliária
--     investimentos  pai=onix-co   Onix Capital
--     tech           pai=onix-co   Onix Tech
--
-- E o custo da recusa não é "a migration para": `package.json` roda
-- `prisma migrate deploy && next start`, e o `&&` faz o `next start` não
-- acontecer. A migration falhando derruba o SERVIÇO, em loop de restart, até
-- alguém corrigir. O guard estava certo na intenção e caro demais na prática.
--
-- Daí as três fases: coluna nullable → backfill explícito → SET NOT NULL. O
-- papel de cada linha continua sendo DECISÃO ESCRITA, não DEFAULT nem dedução
-- por profundidade; o que muda é que a decisão está aqui, legível, em vez de
-- ser cobrada do Postgres no meio do deploy.

-- CreateEnum
CREATE TYPE "TipoNo" AS ENUM ('holding', 'empresa', 'departamento');

-- ── FASE 1 · colunas ─────────────────────────────────────────────────────
-- `tipo` entra NULLABLE. `transversal` já entra NOT NULL porque tem DEFAULT:
-- nenhuma das 6 linhas é "Qualidade e Pós-venda", então `false` é o valor
-- correto para todas, e não é chute.
ALTER TABLE "Empresa" ADD COLUMN     "tipo" "TipoNo",
ADD COLUMN     "transversal" BOOLEAN NOT NULL DEFAULT false;

-- ── FASE 2 · backfill, uma linha por vez ─────────────────────────────────
-- Um UPDATE por id, e não um CASE, para que o diff mostre cada decisão
-- separada e para que remover uma decisão errada seja apagar uma linha.
-- Conforme `src/lib/empresas/catalogo.ts`.

-- A holding do grupo. Única linha sem pai.
UPDATE "Empresa" SET "tipo" = 'holding'  WHERE "id" = 'onix-co';

-- As 4 pessoas jurídicas que já existem no banco. Todas seguem penduradas
-- direto na holding — nenhuma muda de pai.
UPDATE "Empresa" SET "tipo" = 'empresa'  WHERE "id" = 'investimentos';  -- Onix Capital
UPDATE "Empresa" SET "tipo" = 'empresa'  WHERE "id" = 'corretora';      -- Onix Corretora
UPDATE "Empresa" SET "tipo" = 'empresa'  WHERE "id" = 'imobiliaria';    -- Onix Imob
UPDATE "Empresa" SET "tipo" = 'empresa'  WHERE "id" = 'tech';           -- Onix Tech

-- A ÚNICA linha que muda de lugar: "Onix Corporate" deixa de ser pessoa
-- jurídica pendurada na holding e passa a ser departamento DENTRO da
-- Corretora. O id não muda — `Implementacao.empresaId` tem linhas em produção
-- apontando para 'corporate', e `NOS_ECOSSISTEMA` casa por valor.
UPDATE "Empresa"
   SET "tipo" = 'departamento',
       "parentId" = 'corretora'
 WHERE "id" = 'corporate';

-- ── Guard · nenhuma linha pode sobrar sem papel ──────────────────────────
-- Se produção tiver ganhado uma 7ª linha entre a conferência e o deploy, o
-- `SET NOT NULL` abaixo falharia com 23502 — mensagem que não diz QUEM. Este
-- bloco falha antes e nomeia os ids, para o conserto ser um UPDATE óbvio em
-- vez de uma investigação com o app fora do ar.
--
-- Continua sendo uma parada dura, e é para ser: rotular por chute uma linha
-- que ninguém declarou é pior que o deploy parar. A conferência que evita
-- isso é `scripts/verificar-empresa-vazia.ts`, rodado imediatamente antes.
DO $$
DECLARE
  orfas text;
BEGIN
  SELECT string_agg(quote_literal("id"), ', ' ORDER BY "id")
    INTO orfas
    FROM "Empresa"
   WHERE "tipo" IS NULL;

  IF orfas IS NOT NULL THEN
    RAISE EXCEPTION
      'Backfill incompleto: linha(s) em "Empresa" sem tipo -> %. Decida holding/empresa/departamento para cada uma, acrescente o UPDATE nesta migration e rode de novo.',
      orfas;
  END IF;
END $$;

-- ── FASE 3 · a coluna vira obrigatória ───────────────────────────────────
-- A partir daqui, toda linha nova precisa declarar o papel. É a mesma
-- garantia da versão anterior, cobrada depois do dado existente estar
-- resolvido em vez de antes.
ALTER TABLE "Empresa" ALTER COLUMN "tipo" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Empresa_transversal_idx" ON "Empresa"("transversal");
