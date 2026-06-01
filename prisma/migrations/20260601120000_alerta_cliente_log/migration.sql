-- CreateTable
CREATE TABLE "AlertaClienteLog" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "gatilho" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "statusDesde" TIMESTAMP(3),
    "alertadoEm" TIMESTAMP(3),
    "ultimoValor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertaClienteLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertaClienteLog_chave_key" ON "AlertaClienteLog"("chave");

-- CreateIndex
CREATE INDEX "AlertaClienteLog_gatilho_idx" ON "AlertaClienteLog"("gatilho");

-- CreateIndex
CREATE INDEX "AlertaClienteLog_clienteId_idx" ON "AlertaClienteLog"("clienteId");
