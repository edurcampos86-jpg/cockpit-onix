-- Código do Assessor no BTG (coluna "Código do Assessor" da Base BTG).
-- Casa por VALOR com "ClienteBackoffice"."assessorCge" — sem FK, mesma
-- convenção de "CarteiraCge"."cge".
--
-- NULLABLE: imobiliária, corretora e administrativo não têm vínculo com o BTG.
-- UNIQUE: dois assessores nunca compartilham código (verificado na Base BTG —
-- 16 assessores, 16 códigos distintos, 1 código por pessoa).
-- UNIQUE em coluna nullable no Postgres não conflita entre NULLs, então todas
-- as pessoas sem código convivem.
ALTER TABLE "Pessoa" ADD COLUMN "codigoAssessorBtg" TEXT;

CREATE UNIQUE INDEX "Pessoa_codigoAssessorBtg_key" ON "Pessoa"("codigoAssessorBtg");
