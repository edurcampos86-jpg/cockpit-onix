-- Rastro de quem preencheu o código do assessor BTG e quando.
--
-- Mesmo padrão de "cadenciaReuniaoEditadoEm/Por" e "feeFixoEditadoEm/Por" em
-- ClienteBackoffice: campo que muda atribuição de carteira precisa de autoria.
-- Um código errado transfere a carteira inteira (e a cobrança de cadência) para
-- outra pessoa, sem nenhum outro sinal na tela.
--
-- NULL = nunca preenchido. Aditiva, sem backfill: os códigos que entrarem pelo
-- seed gravam "seed"; os digitados na tela gravam o userId da sessão.
ALTER TABLE "Pessoa" ADD COLUMN "codigoAssessorBtgEditadoEm" TIMESTAMP(3);
ALTER TABLE "Pessoa" ADD COLUMN "codigoAssessorBtgEditadoPor" TEXT;
