-- Procedência dos agregados de reunião do cliente.
--
-- `ultimaReuniaoAt` / `proximaReuniaoAt` já existem, mas não dizem DE ONDE o
-- dado veio. A tabela de clientes passa a exibir isso como badge, e a
-- procedência é GRAVADA no recompute (lib/reunioes.ts) a partir da linha
-- vencedora de ReuniaoCliente — não inferida no render. Assim a UI não
-- reimplementa o desempate, e o que aparece é o mesmo registro que decidiu a
-- data.
--
-- Dois eixos INDEPENDENTES, por isso quatro colunas e não duas:
--
--   *Source                = de ONDE veio  → "google-cal" | "outlook-ics"
--                                            | "outlook-web"
--                                            | "datacrazy-atividade"
--   *ConfirmadaManualmente = COMO foi ligada ao cliente (matchedVia="manual")
--
-- "manual" NÃO é uma quinta fonte: upsertReuniao nunca grava esse valor em
-- `source`. Uma reunião do Google ligada à mão tem source "google-cal" E
-- confirmação manual — por isso o selo é sobreposto ao badge, não o substitui.
--
-- Source é NULLABLE (sem reunião no agregado = sem procedência). Os booleanos
-- são NOT NULL DEFAULT false: as linhas existentes recebem `false` no ALTER
-- (Postgres 11+ não reescreve a tabela para default constante), então não há
-- backfill e a migration é rápida. Até o próximo recompute rodar, as linhas
-- ficam com source NULL — a UI não deve inventar rótulo nesse caso.
--
-- Nota de manutenção: o diff automático do Prisma também propõe
-- `DROP INDEX "PainelEmailAI_tsv_idx"` e
-- `ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT` — drift
-- conhecido (coluna GENERATED + índice full-text criados por SQL cru em
-- 20260519240000_painel_email_ai_fts, não representáveis no schema.prisma).
-- Os dois foram REMOVIDOS desta migration de propósito; aplicá-los quebraria a
-- busca do Painel do Dia. Mesmo tratamento das migrations 20260730210000 e
-- 20260730220000.

-- AlterTable
ALTER TABLE "ClienteBackoffice" ADD COLUMN     "proximaReuniaoConfirmadaManualmente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proximaReuniaoSource" TEXT,
ADD COLUMN     "ultimaReuniaoConfirmadaManualmente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ultimaReuniaoSource" TEXT;
