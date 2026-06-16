-- AlterTable
ALTER TABLE "ClienteBackoffice" ADD COLUMN     "saldoContaDesde" TIMESTAMP(3);

-- Seed: clientes existentes começam o relógio na data em que a migration rodar
-- (em prod, no próximo deploy). null fica reservado para "nunca medido".
UPDATE "ClienteBackoffice" SET "saldoContaDesde" = NOW()
  WHERE "saldoContaDesde" IS NULL;
