-- PessoaGrupo (identidade acima do cliente) + EmpresaBootstrapLog (audit log
-- do bootstrap da hierarquia) — migration 100% ADITIVA.
--
-- Cria DUAS tabelas novas e acrescenta UMA coluna nullable a ClienteBackoffice.
-- Nenhum DROP de dado, nenhum NOT NULL em coluna existente, nenhum rename,
-- nenhuma coluna existente alterada.
--
-- `ClienteBackoffice.pessoaGrupoId` entra NULLABLE e SEM BACKFILL: toda linha
-- existente permanece com NULL e nenhuma é lida ou reescrita, então não há
-- janela de bloqueio nem caminho de perda de dado. `ADD COLUMN` nullable sem
-- default é operação de catálogo no Postgres 11+ — não reescreve a tabela.
--
-- `numeroConta` NÃO foi tocado: segue com @@index (não é UNIQUE hoje, ver
-- src/lib/backoffice/upsert-cliente.ts:10-11, que é por isso que o upsert usa
-- findFirst + create/update em vez de prisma.upsert).
--
-- `PessoaGrupo.cpfCnpj` é UNIQUE sobre o documento CANÔNICO (só dígitos). A
-- normalização é responsabilidade do app — src/lib/empresas/pessoa-grupo.ts —
-- porque o UNIQUE sozinho aceitaria "097.146.005-10" e "09714600510" como
-- duas pessoas distintas.
--
-- `EmpresaBootstrapLog.usuarioId` usa ON DELETE RESTRICT de propósito, igual
-- ContratoAcessoLog: apagar um User não pode apagar o registro de que ele agiu.
--
-- Rollback = DROP TABLE "EmpresaBootstrapLog"; DROP TABLE "PessoaGrupo";
--            ALTER TABLE "ClienteBackoffice" DROP COLUMN "pessoaGrupoId";
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
-- então o Prisma a lê como divergência a cada `migrate dev`. É a TERCEIRA
-- migration seguida com a mesma remoção manual — ver 20260806083819 e
-- 20260807114022.

-- AlterTable
ALTER TABLE "ClienteBackoffice" ADD COLUMN     "pessoaGrupoId" TEXT;

-- CreateTable
CREATE TABLE "PessoaGrupo" (
    "id" TEXT NOT NULL,
    "cpfCnpj" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PessoaGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpresaBootstrapLog" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmpresaBootstrapLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PessoaGrupo_cpfCnpj_key" ON "PessoaGrupo"("cpfCnpj");

-- CreateIndex
CREATE INDEX "PessoaGrupo_tipoDocumento_idx" ON "PessoaGrupo"("tipoDocumento");

-- CreateIndex
CREATE INDEX "EmpresaBootstrapLog_usuarioId_timestamp_idx" ON "EmpresaBootstrapLog"("usuarioId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "EmpresaBootstrapLog_acao_timestamp_idx" ON "EmpresaBootstrapLog"("acao", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "EmpresaBootstrapLog_empresaId_timestamp_idx" ON "EmpresaBootstrapLog"("empresaId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ClienteBackoffice_pessoaGrupoId_idx" ON "ClienteBackoffice"("pessoaGrupoId");

-- AddForeignKey
ALTER TABLE "ClienteBackoffice" ADD CONSTRAINT "ClienteBackoffice_pessoaGrupoId_fkey" FOREIGN KEY ("pessoaGrupoId") REFERENCES "PessoaGrupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpresaBootstrapLog" ADD CONSTRAINT "EmpresaBootstrapLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
