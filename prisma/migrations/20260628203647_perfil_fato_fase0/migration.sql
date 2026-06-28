-- CreateTable
CREATE TABLE "ClienteFato" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "reuniaoId" TEXT,
    "categoria" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valor" TEXT,
    "valorAnterior" TEXT,
    "dados" JSONB,
    "fonte" TEXT NOT NULL,
    "sensivel" BOOLEAN NOT NULL DEFAULT false,
    "confirmado" BOOLEAN NOT NULL DEFAULT false,
    "vence" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteFato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClienteFato_clienteId_idx" ON "ClienteFato"("clienteId");

-- CreateIndex
CREATE INDEX "ClienteFato_clienteId_campo_idx" ON "ClienteFato"("clienteId", "campo");

-- CreateIndex
CREATE INDEX "ClienteFato_clienteId_categoria_idx" ON "ClienteFato"("clienteId", "categoria");

-- CreateIndex
CREATE INDEX "ClienteFato_vence_idx" ON "ClienteFato"("vence");

-- AddForeignKey
ALTER TABLE "ClienteFato" ADD CONSTRAINT "ClienteFato_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteFato" ADD CONSTRAINT "ClienteFato_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "ReuniaoEstruturada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
