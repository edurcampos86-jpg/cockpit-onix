-- NOTA (entrega segura): removidas 2 linhas de DRIFT recorrente do FTS de
-- PainelEmailAI que o Prisma re-emite em TODA migration (coluna "tsv" é
-- Unsupported("tsvector") + índice GIN não representável no schema):
--   DROP INDEX "PainelEmailAI_tsv_idx";
--   ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
-- Mantê-las derrubaria o índice de busca / a coluna gerada em produção. Não
-- tocar o FTS. Ver 20260613120000_painel_email_fts_index_recreate.
-- Resultado: esta migration RBAC é 100% ADITIVA (CREATE TABLE / ADD COLUMN
-- nullable / CREATE INDEX / ADD FK), zero DROP/destrutivo.

-- AlterTable
ALTER TABLE "Pessoa" ADD COLUMN     "papelId" TEXT;

-- CreateTable
CREATE TABLE "Carteira" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carteira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarteiraCge" (
    "id" TEXT NOT NULL,
    "carteiraId" TEXT NOT NULL,
    "cge" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarteiraCge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcessoCarteira" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "carteiraId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcessoCarteira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Papel" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "isSistema" BOOLEAN NOT NULL DEFAULT false,
    "escopoOperacional" TEXT NOT NULL DEFAULT 'propria',
    "adminGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Papel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PapelPermissao" (
    "id" TEXT NOT NULL,
    "papelId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'nenhum',

    CONSTRAINT "PapelPermissao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Carteira_donoId_idx" ON "Carteira"("donoId");

-- CreateIndex
CREATE UNIQUE INDEX "CarteiraCge_cge_key" ON "CarteiraCge"("cge");

-- CreateIndex
CREATE INDEX "CarteiraCge_carteiraId_idx" ON "CarteiraCge"("carteiraId");

-- CreateIndex
CREATE INDEX "AcessoCarteira_pessoaId_idx" ON "AcessoCarteira"("pessoaId");

-- CreateIndex
CREATE INDEX "AcessoCarteira_carteiraId_idx" ON "AcessoCarteira"("carteiraId");

-- CreateIndex
CREATE UNIQUE INDEX "AcessoCarteira_pessoaId_carteiraId_key" ON "AcessoCarteira"("pessoaId", "carteiraId");

-- CreateIndex
CREATE UNIQUE INDEX "Papel_nome_key" ON "Papel"("nome");

-- CreateIndex
CREATE INDEX "PapelPermissao_papelId_idx" ON "PapelPermissao"("papelId");

-- CreateIndex
CREATE UNIQUE INDEX "PapelPermissao_papelId_area_key" ON "PapelPermissao"("papelId", "area");

-- CreateIndex
CREATE INDEX "Pessoa_papelId_idx" ON "Pessoa"("papelId");

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_papelId_fkey" FOREIGN KEY ("papelId") REFERENCES "Papel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carteira" ADD CONSTRAINT "Carteira_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarteiraCge" ADD CONSTRAINT "CarteiraCge_carteiraId_fkey" FOREIGN KEY ("carteiraId") REFERENCES "Carteira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcessoCarteira" ADD CONSTRAINT "AcessoCarteira_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcessoCarteira" ADD CONSTRAINT "AcessoCarteira_carteiraId_fkey" FOREIGN KEY ("carteiraId") REFERENCES "Carteira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PapelPermissao" ADD CONSTRAINT "PapelPermissao_papelId_fkey" FOREIGN KEY ("papelId") REFERENCES "Papel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
