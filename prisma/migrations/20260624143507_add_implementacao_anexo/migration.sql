-- CreateTable
CREATE TABLE "ImplementacaoAnexo" (
    "id" TEXT NOT NULL,
    "implementacaoId" TEXT NOT NULL,
    "b2Key" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImplementacaoAnexo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImplementacaoAnexo_implementacaoId_idx" ON "ImplementacaoAnexo"("implementacaoId");

-- AddForeignKey
ALTER TABLE "ImplementacaoAnexo" ADD CONSTRAINT "ImplementacaoAnexo_implementacaoId_fkey" FOREIGN KEY ("implementacaoId") REFERENCES "Implementacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
