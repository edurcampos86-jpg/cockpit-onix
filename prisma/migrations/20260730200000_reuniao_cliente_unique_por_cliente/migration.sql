-- ReuniaoCliente: UNIQUE passa a incluir `clienteId`.
--
-- Um mesmo evento de calendário pode casar com VÁRIOS clientes (reunião com
-- casal, título citando dois nomes). Com a chave antiga
-- (userId, source, externalId) os matches do mesmo evento disputavam UMA linha:
-- cada upsert sobrescrevia o anterior e a linha terminava com o match de MENOR
-- confiança (ordem email -> nome-unico -> nome-substring), cujo matchScore 30 é
-- filtrado do rollup — a reunião sumia das colunas de todos os envolvidos.
--
-- SEM DEDUPE: a chave antiga é ESTRITAMENTE MAIS RESTRITIVA que a nova
-- (todo par único em 3 colunas continua único em 4). Nenhuma linha existente
-- pode violar o novo constraint, então a criação do índice não falha e não há
-- dado a limpar antes.
--
-- Nota de manutenção: o diff automático do Prisma também propõe
-- `DROP INDEX "PainelEmailAI_tsv_idx"` e
-- `ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT` — drift
-- conhecido, porque o índice full-text e o default da coluna foram criados por
-- SQL cru e não são representáveis no schema.prisma. Os dois foram REMOVIDOS
-- desta migration de propósito; aplicá-los quebraria a busca do Painel.

-- DropIndex
DROP INDEX "ReuniaoCliente_userId_source_externalId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ReuniaoCliente_userId_source_externalId_clienteId_key" ON "ReuniaoCliente"("userId", "source", "externalId", "clienteId");
