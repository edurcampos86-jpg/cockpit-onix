-- Remoção de "AcordoComercialParceiro"."tipoProduto" — a segunda metade da
-- troca começada na migration 20260822020000.
--
-- ⚠️ MIGRATION DESTRUTIVA. Exige a label `migration-destrutiva` na PR (gate do
-- .github/workflows/estado-do-banco.yml). O DROP COLUMN apaga o texto de
-- produto das linhas antigas, e backup não devolve isso sem downtime.
--
-- ─────────────────────────────────────────────────────────────────────────
-- A ORDEM AQUI É A GUARDA, E ELA É DELIBERADA
-- ─────────────────────────────────────────────────────────────────────────
-- O primeiro statement é `SET NOT NULL` em "empresaId". Ele FALHA com 23502 se
-- qualquer acordo ainda estiver sem nó — ou seja, se o de-para de
-- "tipoProduto" para "empresaId" não tiver sido feito.
--
-- Isso é proposital: melhor a migration recusar do que apagar o único registro
-- de onde o acordo incidia e deixar uma linha órfã que nenhum fechamento sabe
-- aplicar.
--
-- 🔴 MAS ATENÇÃO AO CUSTO DESSA ESCOLHA, porque ela repete a armadilha da #301:
-- o start do serviço é `prisma migrate deploy && next start`. Migration que
-- falha NÃO vira "migration pendente" — vira APP EM LOOP DE RESTART.
--
-- Por isso esta PR NÃO PODE ser mergeada sem antes conferir, em produção, que
-- não há acordo sem nó. A conferência é read-only e roda sozinha nesta PR: o
-- step "Acordos de parceiro sem nó" do estado-do-banco.yml (acrescentado no
-- mesmo commit) responde isso no resumo do job.
--
--   sem_no = 0  → pode mergear
--   sem_no > 0  → migrar o dado ANTES; mergear assim derruba o serviço
--
-- ─────────────────────────────────────────────────────────────────────────
-- O QUE SAI, E O QUE FICA
-- ─────────────────────────────────────────────────────────────────────────
-- Sai: a coluna "tipoProduto" e o índice parcial único antigo
-- ("AcordoComercialParceiro_vigente_key"), que passa a não ter sobre o que
-- garantir. O índice novo, por (parceiroId, empresaId), continua.
--
-- Fica INTOCADO: "ContratoCorretora"."tipoProduto" — outro campo, outra tabela,
-- catálogo próprio em src/lib/corretora/catalogo-produtos.ts, e alimenta a
-- importação de contratos. Nome igual, coisa diferente.
--
-- Rollback (perde o texto de produto, que é o ponto do DROP):
--   ALTER TABLE "AcordoComercialParceiro" ADD COLUMN "tipoProduto" TEXT;
--   CREATE UNIQUE INDEX "AcordoComercialParceiro_vigente_key"
--     ON "AcordoComercialParceiro" ("parceiroId","tipoProduto") WHERE "dataFim" IS NULL;
--   ALTER TABLE "AcordoComercialParceiro" ALTER COLUMN "empresaId" DROP NOT NULL;

-- Guarda: recusa a migration se houver acordo sem nó. Ver o bloco acima.
ALTER TABLE "AcordoComercialParceiro" ALTER COLUMN "empresaId" SET NOT NULL;

-- DropIndex
DROP INDEX "AcordoComercialParceiro_vigente_key";

-- DropIndex
DROP INDEX "AcordoComercialParceiro_tipoProduto_idx";

-- AlterTable
ALTER TABLE "AcordoComercialParceiro" DROP COLUMN "tipoProduto";
