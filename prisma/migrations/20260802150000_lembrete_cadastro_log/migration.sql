-- Registro de lembretes de cadastro enviados.
--
-- Sem ele não há como saber se alguém já foi cobrado nem há quanto tempo, e o
-- risco concreto é disparar duas vezes no mesmo dia — WhatsApp e e-mail para o
-- time inteiro, sem desfazer.
--
-- Mesma ideia do dedupe de AlertaClienteLog, com uma diferença deliberada:
-- só grava disparo BEM-SUCEDIDO. Tentativa que falhou em todos os canais não
-- carimba, senão o dedupe bloquearia a próxima tentativa justamente de quem
-- não recebeu nada.
CREATE TABLE "LembreteCadastroLog" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL,
    "canais" TEXT NOT NULL,
    "pendencias" TEXT NOT NULL,
    "vezes" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LembreteCadastroLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LembreteCadastroLog_pessoaId_key" ON "LembreteCadastroLog"("pessoaId");

CREATE INDEX "LembreteCadastroLog_enviadoEm_idx" ON "LembreteCadastroLog"("enviadoEm");
