-- Acordo de parceiro por NÓ DA HIERARQUIA — parte ADITIVA.
--
-- Esta migration NÃO remove nada. Acrescenta o caminho novo e deixa o antigo
-- funcionando ao lado dele. A remoção de "tipoProduto" é PR própria, com label
-- `migration-destrutiva`, e só depois de o dado estar migrado.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE NÓ DA HIERARQUIA, E NÃO TEXTO DE PRODUTO
-- ─────────────────────────────────────────────────────────────────────────
-- "tipoProduto" nasceu TEXT livre (#318) porque a taxonomia de produto ainda
-- mudava. Com o uso, a pergunta do negócio revelou-se outra: não é "qual
-- produto?", é "QUAL PARTE DA CASA?" — "Onix Corretora 20%", "Planejamento
-- Patrimonial 20%", "Onix Imobiliária 0%".
--
-- Isso já está modelado: "Empresa" tem nós tipados (holding/empresa/
-- departamento) com "parentId". Trocar texto por FK muda o que o banco
-- consegue garantir: typo em TEXT vira acordo pendurado num nó fantasma, e o
-- fechamento não teria como saber que ele existe.
--
-- ⚠️ NADA AQUI TOCA "ContratoCorretora"."tipoProduto". Nome igual, coisa
-- diferente: aquele é o produto VENDIDO, tem catálogo em
-- src/lib/corretora/catalogo-produtos.ts e alimenta a importação de contratos.
--
-- ─────────────────────────────────────────────────────────────────────────
-- "incluiDescendentes" — a decisão do Eduardo, e por que POR LINHA
-- ─────────────────────────────────────────────────────────────────────────
-- "Onix Corretora 20%" cobre os departamentos dentro dela? A resposta certa
-- depende do acordo, não do sistema: um parceiro pode ter combinação guarda-
-- chuva com a Corretora inteira e outro só com um departamento.
--
-- Então a escolha é POR LINHA, copiando "PessoaEmpresa"."incluiDescendentes"
-- (RBAC), que resolve a mesma pergunta: quem concede escolhe se desce.
--
-- DEFAULT false, ao contrário do RBAC (que usa true). Dinheiro é o caso em que
-- o silêncio precisa significar o MENOS abrangente: marcar é decisão de quem
-- fecha o acordo, e não marcar não pode gerar pagamento que ninguém combinou.
--
-- ─────────────────────────────────────────────────────────────────────────
-- OS DOIS ÍNDICES CONVIVEM, DE PROPÓSITO
-- ─────────────────────────────────────────────────────────────────────────
-- O índice antigo (parceiroId, tipoProduto) WHERE dataFim IS NULL continua de
-- pé, protegendo as linhas antigas. O novo faz o mesmo por (parceiroId,
-- empresaId).
--
-- Eles não brigam porque o Postgres trata NULL como DISTINTO em índice único:
-- linha nova tem tipoProduto NULL e não colide no índice antigo; linha antiga
-- tem empresaId NULL e não colide no novo. É essa propriedade que permite a
-- troca em duas etapas sem janela de desproteção.
--
-- Por isso "tipoProduto" perde o NOT NULL aqui: sem isso, toda linha nova
-- precisaria inventar um texto de produto só para satisfazer a coluna que está
-- de saída. DROP NOT NULL não é operação destrutiva — nenhum dado é perdido, e
-- o rollback é um SET NOT NULL depois de preencher.
--
-- SEM BACKFILL nesta PR: o de-para de texto para nó é decisão de negócio
-- ("previdência" pertence a qual nó?), e decisão de negócio não entra em
-- migration por palpite. As linhas antigas seguem lendo por "tipoProduto".
--
-- Rollback:
--   DROP INDEX "AcordoComercialParceiro_vigente_empresa_key";
--   ALTER TABLE "AcordoComercialParceiro" DROP CONSTRAINT "AcordoComercialParceiro_empresaId_fkey";
--   DROP INDEX "AcordoComercialParceiro_empresaId_idx";
--   ALTER TABLE "AcordoComercialParceiro" DROP COLUMN "empresaId", DROP COLUMN "incluiDescendentes";
--   -- e, se nenhuma linha estiver com tipoProduto NULL:
--   ALTER TABLE "AcordoComercialParceiro" ALTER COLUMN "tipoProduto" SET NOT NULL;

-- AlterTable
ALTER TABLE "AcordoComercialParceiro" ALTER COLUMN "tipoProduto" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AcordoComercialParceiro" ADD COLUMN     "empresaId" TEXT,
ADD COLUMN     "incluiDescendentes" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "AcordoComercialParceiro_empresaId_idx" ON "AcordoComercialParceiro"("empresaId");

-- AddForeignKey
ALTER TABLE "AcordoComercialParceiro" ADD CONSTRAINT "AcordoComercialParceiro_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Índice parcial único NOVO: no máximo UM acordo vigente por (parceiro, nó).
-- Mesma forma do antigo, que continua de pé. Fora do alcance do schema.prisma
-- (Prisma não expressa índice parcial), como os demais da casa.
-- ─────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "AcordoComercialParceiro_vigente_empresa_key"
  ON "AcordoComercialParceiro" ("parceiroId", "empresaId")
  WHERE "dataFim" IS NULL;
