-- F5 Meta Ads Fase 1 — migration 100% aditiva.
-- NOTA: o `prisma migrate dev` gerou aqui 2 statements de drift sobre
-- PainelEmailAI.tsv (DROP INDEX do FTS + ALTER DROP DEFAULT) porque a
-- coluna gerada vive em SQL bruto (20260519240000) e o schema declara
-- Unsupported("tsvector"). Foram REMOVIDOS à mão: não pertencem à F5 e
-- o DROP INDEX destruiria o índice FTS de produção.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "firstEventId" TEXT,
ADD COLUMN     "sourceDor" TEXT,
ADD COLUMN     "sourceProjeto" TEXT,
ADD COLUMN     "sourceSubpersona" TEXT;

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourcePostId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "subpersonaTag" TEXT,
    "dorTag" TEXT,
    "projetoTag" TEXT,
    "costBrl" DOUBLE PRECISION,
    "rawPayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId" TEXT,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignSnapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "adsetId" TEXT,
    "adId" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spendBrl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpmBrl" DOUBLE PRECISION,
    "cpcBrl" DOUBLE PRECISION,
    "results" INTEGER,
    "resultType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaignSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackingEvent_occurredAt_idx" ON "TrackingEvent"("occurredAt" DESC);

-- CreateIndex
CREATE INDEX "TrackingEvent_subpersonaTag_dorTag_projetoTag_idx" ON "TrackingEvent"("subpersonaTag", "dorTag", "projetoTag");

-- CreateIndex
CREATE INDEX "AdCampaignSnapshot_date_idx" ON "AdCampaignSnapshot"("date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaignSnapshot_date_campaignId_adsetId_adId_key" ON "AdCampaignSnapshot"("date", "campaignId", "adsetId", "adId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_firstEventId_fkey" FOREIGN KEY ("firstEventId") REFERENCES "TrackingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
