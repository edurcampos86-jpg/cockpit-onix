-- Rastro de edição do teto manual de reunião (cadenciaReuniaoDiasOverride).
--
-- Mesmo padrão de feeFixoEditadoEm/Por e apelidoEditadoEm/Por.
--
-- Por que este campo em particular precisa de rastro: afrouxar o teto de um
-- cliente é a única edição da tabela que APAGA um alerta de risco de evasão.
-- Se um cliente for perdido, a primeira pergunta é "alguém afrouxou a régua
-- dele, quando, e por quê?" — sem "quem/quando" essa pergunta não tem
-- resposta, e o override viraria uma forma silenciosa de sumir com o alarme.
--
-- Ambas NULLABLE: as linhas existentes ficam com NULL ("nunca editado"), sem
-- backfill e sem reescrita de tabela.
--
-- Nota de manutenção: o diff automático do Prisma também propõe
-- `DROP INDEX "PainelEmailAI_tsv_idx"` e
-- `ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT` — drift
-- conhecido (coluna GENERATED + índice full-text criados por SQL cru em
-- 20260519240000_painel_email_ai_fts, não representáveis no schema.prisma).
-- Os dois foram REMOVIDOS desta migration de propósito; aplicá-los quebraria a
-- busca do Painel do Dia. Mesmo tratamento das migrations 20260730210000,
-- 20260730220000, 20260801061615 e 20260801072219.

-- AlterTable
ALTER TABLE "ClienteBackoffice" ADD COLUMN     "cadenciaReuniaoEditadoEm" TIMESTAMP(3),
ADD COLUMN     "cadenciaReuniaoEditadoPor" TEXT;
