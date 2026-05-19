-- AlterTable: adiciona campos de sugestão de evento detectada via triagem AI.
ALTER TABLE "PainelEmailAI"
  ADD COLUMN "eventoSugeridoJson" JSONB,
  ADD COLUMN "eventoProcessado" BOOLEAN NOT NULL DEFAULT false;
