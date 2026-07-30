-- Rastro de edição do Fee Fixo — mesmo padrão de apelidoEditadoEm/Por.
--
-- `feeFixo` é a única marcação da tabela de clientes que é ao mesmo tempo
-- MANUAL e FINANCEIRA (as demais ou vêm do BTG, ou já têm rastro próprio).
-- Com RBAC ligado e mais de um assessor mexendo, "quem marcou esse cliente
-- como fee fixo?" precisa ter resposta — e registrar agora, com a coluna
-- recém-criada e ainda pouco usada, evita um backfill sem resposta depois.
--
-- Ambas as colunas são NULLABLE: as linhas existentes ficam com NULL
-- ("marcado antes do rastro existir" / "nunca alterado"), sem backfill e sem
-- reescrita de tabela.
--
-- Nota de manutenção: o diff automático do Prisma também propõe
-- `DROP INDEX "PainelEmailAI_tsv_idx"` e
-- `ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT` — drift
-- conhecido (coluna GENERATED + índice full-text criados por SQL cru). Os dois
-- foram REMOVIDOS desta migration de propósito; quebrariam a busca do Painel.

-- AlterTable
ALTER TABLE "ClienteBackoffice" ADD COLUMN "feeFixoEditadoEm" TIMESTAMP(3),
ADD COLUMN "feeFixoEditadoPor" TEXT;
