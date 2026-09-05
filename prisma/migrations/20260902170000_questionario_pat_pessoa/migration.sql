-- NOTA (entrega segura): esta migration é somente aditiva. Não contém os dois
-- statements de drift que o Prisma costuma reemitir para PainelEmailAI.tsv:
--   DROP INDEX "PainelEmailAI_tsv_idx";
--   ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;

-- CreateTable
CREATE TABLE "QuestionarioPatPessoa" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "patId" TEXT,
    "versaoPerguntas" INTEGER NOT NULL,
    "perguntasSnapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "preocupacoesAtuais" TEXT,
    "objetivoCurtoPrazo" TEXT,
    "objetivoLongoPrazo" TEXT,
    "incentivos" TEXT,
    "desmotivadores" TEXT,
    "esforcosNecessarios" TEXT,
    "apoioEsperado" TEXT,
    "indicadoresProgresso" TEXT,
    "proximaRevisao" TIMESTAMP(3),
    "criadoPorUserId" TEXT NOT NULL,
    "atualizadoPorUserId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionarioPatPessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionarioPatAcompanhamento" (
    "id" TEXT NOT NULL,
    "questionarioId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "direcao" TEXT NOT NULL,
    "evidencias" TEXT NOT NULL,
    "proximosEsforcos" TEXT,
    "criadoPorUserId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionarioPatAcompanhamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionarioPatPessoa_pessoaId_key" ON "QuestionarioPatPessoa"("pessoaId");

-- CreateIndex
CREATE INDEX "QuestionarioPatPessoa_patId_idx" ON "QuestionarioPatPessoa"("patId");

-- CreateIndex
CREATE INDEX "QuestionarioPatPessoa_status_proximaRevisao_idx" ON "QuestionarioPatPessoa"("status", "proximaRevisao");

-- CreateIndex
CREATE INDEX "QuestionarioPatAcompanhamento_questionarioId_data_idx" ON "QuestionarioPatAcompanhamento"("questionarioId", "data" DESC);

-- AddForeignKey
ALTER TABLE "QuestionarioPatPessoa" ADD CONSTRAINT "QuestionarioPatPessoa_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionarioPatPessoa" ADD CONSTRAINT "QuestionarioPatPessoa_patId_fkey" FOREIGN KEY ("patId") REFERENCES "Pat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionarioPatAcompanhamento" ADD CONSTRAINT "QuestionarioPatAcompanhamento_questionarioId_fkey" FOREIGN KEY ("questionarioId") REFERENCES "QuestionarioPatPessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill guardado do PAT vigente do time.
--
-- O upload histórico criou PATs sempre com vigente=false. Para cada pessoa que
-- ainda NÃO tem nenhum vigente, escolhemos somente o registro extraído mais
-- recente. Quem já tem vigente não é tocado; PAT de cliente também não entra.
WITH candidatos AS (
    SELECT DISTINCT ON (p."pessoaId") p."id"
    FROM "Pat" p
    WHERE p."pessoaId" IS NOT NULL
      AND p."status" = 'extraido'
      AND NOT EXISTS (
          SELECT 1
          FROM "Pat" vigente
          WHERE vigente."pessoaId" = p."pessoaId"
            AND vigente."vigente" = true
      )
    ORDER BY p."pessoaId", p."dataPat" DESC, p."uploadedAt" DESC, p."id" DESC
)
UPDATE "Pat" p
SET "vigente" = true,
    "updatedAt" = CURRENT_TIMESTAMP
FROM candidatos c
WHERE p."id" = c."id";

-- Tripwire: depois do backfill não pode restar pessoa com PAT extraído mas sem
-- vigente. Se a premissa mudar no futuro, o deploy para em vez de subir uma UI
-- que afirma não haver PAT quando há laudo utilizável.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Pat" p
    WHERE p."pessoaId" IS NOT NULL
      AND p."status" = 'extraido'
      AND NOT EXISTS (
        SELECT 1
        FROM "Pat" vigente
        WHERE vigente."pessoaId" = p."pessoaId"
          AND vigente."vigente" = true
      )
  ) THEN
    RAISE EXCEPTION 'backfill de PAT vigente incompleto';
  END IF;
END $$;
