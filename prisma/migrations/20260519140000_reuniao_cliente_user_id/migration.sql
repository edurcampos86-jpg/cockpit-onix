-- Fase 2: per-user ownership de ReuniaoCliente.
-- Adiciona userId (nullable) e troca o unique (source, externalId) por
-- (userId, source, externalId). Isso evita que dois usuários com o
-- mesmo event.id no Google Calendar colidam no upsert.
--
-- Fontes globais legadas (outlook-ics admin único e datacrazy-atividade)
-- ficam com userId = NULL — Postgres permite múltiplos NULL no unique
-- index, então o comportamento atual delas se mantém.
--
-- google-cal rows existentes vêm do fluxo admin global (GOOGLE_REFRESH_TOKEN)
-- e ficam ÓRFÃS (userId = NULL). Como o cron roda a cada 15min, na próxima
-- execução com o cron novo (per-user) elas serão re-inseridas com o
-- userId do dono e as órfãs antigas serão limpas pelo cleanup window.

-- AlterTable: adiciona userId nullable + FK
ALTER TABLE "ReuniaoCliente" ADD COLUMN "userId" TEXT;

-- AddForeignKey
ALTER TABLE "ReuniaoCliente" ADD CONSTRAINT "ReuniaoCliente_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex: unique antigo (source, externalId)
DROP INDEX IF EXISTS "ReuniaoCliente_source_externalId_key";

-- CreateIndex: unique novo (userId, source, externalId)
CREATE UNIQUE INDEX "ReuniaoCliente_userId_source_externalId_key"
  ON "ReuniaoCliente"("userId", "source", "externalId");

-- CreateIndex: lookup auxiliar
CREATE INDEX "ReuniaoCliente_userId_source_idx"
  ON "ReuniaoCliente"("userId", "source");
