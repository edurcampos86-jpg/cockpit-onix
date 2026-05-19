-- Jurídico — Fase 1B: RBAC granular + 2FA TOTP + Audit log.
-- Adiciona 2 tabelas novas. Relations em User e ContratoArquivo são só
-- camada Prisma — FKs ficam nas tabelas novas.

-- CreateTable: UsuarioPermissao
CREATE TABLE "UsuarioPermissao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "podeVerContratos" BOOLEAN NOT NULL DEFAULT false,
    "podeBaixarContratos" BOOLEAN NOT NULL DEFAULT false,
    "podeEditarContratos" BOOLEAN NOT NULL DEFAULT false,
    "podeAprovarContratos" BOOLEAN NOT NULL DEFAULT false,
    "carteirasPermitidas" JSONB NOT NULL DEFAULT '[]',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecretEnc" TEXT,
    "twoFactorBackupCodes" JSONB,
    "twoFactorVerifiedAt" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsuarioPermissao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioPermissao_userId_key" ON "UsuarioPermissao"("userId");
CREATE INDEX "UsuarioPermissao_twoFactorEnabled_idx" ON "UsuarioPermissao"("twoFactorEnabled");

-- AddForeignKey
ALTER TABLE "UsuarioPermissao"
  ADD CONSTRAINT "UsuarioPermissao_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ContratoAcessoLog
CREATE TABLE "ContratoAcessoLog" (
    "id" TEXT NOT NULL,
    "contratoArquivoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContratoAcessoLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContratoAcessoLog_contratoArquivoId_timestamp_idx" ON "ContratoAcessoLog"("contratoArquivoId", "timestamp" DESC);
CREATE INDEX "ContratoAcessoLog_usuarioId_timestamp_idx" ON "ContratoAcessoLog"("usuarioId", "timestamp" DESC);
CREATE INDEX "ContratoAcessoLog_acao_timestamp_idx" ON "ContratoAcessoLog"("acao", "timestamp" DESC);

-- AddForeignKey
ALTER TABLE "ContratoAcessoLog"
  ADD CONSTRAINT "ContratoAcessoLog_contratoArquivoId_fkey"
  FOREIGN KEY ("contratoArquivoId") REFERENCES "ContratoArquivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContratoAcessoLog"
  ADD CONSTRAINT "ContratoAcessoLog_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
