-- Parceiro como ENTIDADE PRÓPRIA — migration 100% ADITIVA.
--
-- Cria UMA tabela nova e acrescenta UMA coluna nullable a "Indicacao".
-- Nenhum DROP de dado, nenhum NOT NULL em coluna existente, nenhum rename,
-- nenhuma coluna existente alterada.
--
-- POR QUÊ: até aqui "indicador" só existia como "Indicacao"."indicadorId",
-- que é FK para "ClienteBackoffice" — ou seja, quem indicava PRECISAVA ter
-- conta no BTG. Sócio, contador e parceiro comercial que trazem cliente e
-- nunca investiram não tinham onde morar. "Parceiro"."clienteBackofficeId" é
-- NULLABLE justamente por isso: parceiro PODE ser cliente, não precisa ser.
--
-- "Indicacao"."parceiroId" ANDA AO LADO de "indicadorId", que NÃO é tocado —
-- aquele elo está em produção desde a #302 (20260810182055) e segue sendo a
-- verdade para indicador que é cliente. Nenhum dado existente muda de lugar.
--
-- SEM BACKFILL: a tabela "Parceiro" nasce VAZIA, toda "Indicacao" existente
-- fica com "parceiroId" NULL, e NADA no app lê qualquer um dos dois. "ADD
-- COLUMN" nullable sem default é operação de catálogo no Postgres 11+ — não
-- reescreve a tabela, não há janela de bloqueio.
--
-- As duas FKs usam ON DELETE SET NULL: apagar um cliente não pode apagar o
-- parceiro (ele segue existindo como quem indica, só perde a identidade de
-- cliente), e apagar um parceiro não pode apagar a indicação que ele fez.
--
-- "Parceiro_clienteBackofficeId_key" (UNIQUE) impede que dois registros de
-- parceiro reivindiquem o mesmo cliente — sem ele, nenhuma leitura futura
-- saberia qual dos dois vale.
--
-- Rollback = ALTER TABLE "Indicacao" DROP CONSTRAINT "Indicacao_parceiroId_fkey";
--            DROP INDEX "Indicacao_parceiroId_idx";
--            ALTER TABLE "Indicacao" DROP COLUMN "parceiroId";
--            DROP TABLE "Parceiro";
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
-- então o Prisma a lê como divergência a cada `migrate dev`. É a QUINTA
-- migration seguida com a mesma remoção manual — ver 20260806083819,
-- 20260807114022, 20260808210618 e 20260810182055.

-- AlterTable
ALTER TABLE "Indicacao" ADD COLUMN     "parceiroId" TEXT;

-- CreateTable
CREATE TABLE "Parceiro" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "clienteBackofficeId" TEXT,
    "contratoAssinadoEm" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPor" TEXT,
    "atualizadoPor" TEXT,

    CONSTRAINT "Parceiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Parceiro_clienteBackofficeId_key" ON "Parceiro"("clienteBackofficeId");

-- CreateIndex
CREATE INDEX "Parceiro_ativo_idx" ON "Parceiro"("ativo");

-- CreateIndex
CREATE INDEX "Parceiro_tipo_idx" ON "Parceiro"("tipo");

-- CreateIndex
CREATE INDEX "Parceiro_nome_idx" ON "Parceiro"("nome");

-- CreateIndex
CREATE INDEX "Indicacao_parceiroId_idx" ON "Indicacao"("parceiroId");

-- AddForeignKey
ALTER TABLE "Indicacao" ADD CONSTRAINT "Indicacao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "Parceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parceiro" ADD CONSTRAINT "Parceiro_clienteBackofficeId_fkey" FOREIGN KEY ("clienteBackofficeId") REFERENCES "ClienteBackoffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
