-- Hierarquia de empresas do grupo (Onix Co) — migration 100% ADITIVA.
--
-- Cria UMA tabela nova e nada mais: nenhum DROP de dado, nenhum NOT NULL em
-- coluna existente, nenhum rename, nenhuma tabela existente tocada. Nenhuma
-- linha de nenhuma tabela viva é lida ou reescrita, então não há janela de
-- bloqueio nem caminho de perda de dado. Rollback = DROP TABLE "Empresa".
--
-- `id` é o SLUG ("investimentos", "onix-co"), não cuid como o resto do schema.
-- Os valores já gravados em Implementacao.empresaId são exatamente esses
-- slugs, então a FK futura não vai exigir UPDATE em massa para reescrever
-- chave. Ligar as duas pontas é PR própria — aqui não há FK para Implementacao.
--
-- A auto-relação aceita N níveis de propósito. A regra de 2 níveis (raiz
-- "Onix Co" + as empresas) vive como VALIDAÇÃO em código
-- (src/lib/empresas/hierarquia.ts), não como constraint: profundidade em SQL
-- exigiria trigger ou CHECK recursivo, e mudar a régua depois viraria
-- migration em tabela viva.
--
-- ATENÇÃO: o `prisma migrate dev` gerou aqui 2 statements de drift sobre
-- PainelEmailAI.tsv, REMOVIDOS À MÃO:
--
--     DROP INDEX "PainelEmailAI_tsv_idx";
--     ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
--
-- Eles não pertencem a esta migration e o DROP INDEX destruiria o índice FTS
-- de produção. A causa é conhecida e recorrente: a coluna gerada vive em SQL
-- bruto (20260519240000) e o schema a declara como Unsupported("tsvector"),
-- então o Prisma a lê como divergência a cada `migrate dev`. Mesma remoção
-- documentada em 20260806083819_implementacao_prompt_gerado_e_rastreio_pr.

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Empresa_parentId_idx" ON "Empresa"("parentId");

-- AddForeignKey
ALTER TABLE "Empresa" ADD CONSTRAINT "Empresa_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
