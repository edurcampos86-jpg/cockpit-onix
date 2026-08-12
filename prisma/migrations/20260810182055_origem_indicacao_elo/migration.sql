-- Origem do cliente: elo Indicacao → ClienteBackoffice + campo manual de
-- origem não-indicação — migration 100% ADITIVA.
--
-- Acrescenta UMA coluna nullable a "Indicacao" (com FK e índice) e TRÊS
-- colunas nullable a "ClienteBackoffice". Nenhum DROP de dado, nenhum NOT NULL
-- em coluna existente, nenhum rename, nenhuma coluna existente alterada.
--
-- POR QUÊ: "Indicacao".status já aceitava 'convertida' desde a criação da
-- tabela, mas o indicado sempre foi texto solto ("nomeIndicado") — sem FK para
-- o cliente gerado. Partindo de um ClienteBackoffice era impossível responder
-- "quem indicou este cliente?": o elo morria na conversão.
-- "Indicacao"."clienteConvertidoId" fecha esse elo.
--
-- "ClienteBackoffice"."origemIndicacao" é o FALLBACK TEXTO, e só para origens
-- que NÃO são indicação ('evento', 'inbound', 'prospecção fria'). Indicação de
-- verdade vive no elo acima, que preserva QUEM indicou — dado que texto livre
-- não representa. A rota PATCH /api/backoffice/clientes/[id]/origem-indicacao
-- rejeita texto com cara de indicação para que a regra não dependa da
-- disciplina de quem digita.
--
-- SEM BACKFILL nesta migration: toda linha existente nasce NULL, inclusive as
-- indicações que já estão em status 'convertida'. Ligá-las é PR própria —
-- "nomeIndicado" é texto livre e o casamento com o cliente pede revisão
-- humana, não heurística de nome. "ADD COLUMN" nullable sem default é operação
-- de catálogo no Postgres 11+: não reescreve a tabela, não há janela de
-- bloqueio nem caminho de perda de dado.
--
-- A FK usa ON DELETE SET NULL: apagar um cliente não pode apagar o registro de
-- que alguém o indicou — a indicação sobrevive, só perde o ponteiro.
--
-- Rollback = ALTER TABLE "Indicacao" DROP CONSTRAINT "Indicacao_clienteConvertidoId_fkey";
--            DROP INDEX "Indicacao_clienteConvertidoId_idx";
--            ALTER TABLE "Indicacao" DROP COLUMN "clienteConvertidoId";
--            ALTER TABLE "ClienteBackoffice" DROP COLUMN "origemIndicacao",
--              DROP COLUMN "origemIndicacaoEditadoEm",
--              DROP COLUMN "origemIndicacaoEditadoPor";
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
-- então o Prisma a lê como divergência a cada `migrate dev`. É a QUARTA
-- migration seguida com a mesma remoção manual — ver 20260806083819,
-- 20260807114022 e 20260808210618.

-- AlterTable
ALTER TABLE "ClienteBackoffice" ADD COLUMN     "origemIndicacao" TEXT,
ADD COLUMN     "origemIndicacaoEditadoEm" TIMESTAMP(3),
ADD COLUMN     "origemIndicacaoEditadoPor" TEXT;

-- AlterTable
ALTER TABLE "Indicacao" ADD COLUMN     "clienteConvertidoId" TEXT;

-- CreateIndex
CREATE INDEX "Indicacao_clienteConvertidoId_idx" ON "Indicacao"("clienteConvertidoId");

-- AddForeignKey
ALTER TABLE "Indicacao" ADD CONSTRAINT "Indicacao_clienteConvertidoId_fkey" FOREIGN KEY ("clienteConvertidoId") REFERENCES "ClienteBackoffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
