-- Registro rico do cliente — 6 tabelas NOVAS, todas nascendo vazias.
--
-- Nenhum ALTER em tabela existente: nenhuma coluna acrescentada, renomeada ou
-- removida, nenhum DEFAULT alterado, nenhum dado tocado. Só CREATE TABLE,
-- CREATE INDEX e ADD CONSTRAINT ... FOREIGN KEY.
--
-- REMOVIDO À MÃO daqui (drift conhecido, 8ª vez): o `prisma migrate dev`
-- injeta sozinho um `DROP INDEX "PainelEmailAI_tsv_idx"` + `ALTER COLUMN
-- "tsv" DROP DEFAULT` em TODA migration nova, porque o índice FTS e o default
-- do tsvector foram criados por SQL cru e não existem no schema.prisma.
-- Aplicar isso derrubaria a busca full-text do Painel de E-mails.
-- `scripts/guarda-drift-fts.sh` reprova no CI se voltar.

-- CreateTable
CREATE TABLE "ClienteGrupo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteGrupoMembro" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "viaGrupo" BOOLEAN NOT NULL DEFAULT true,
    "adicionadoPor" TEXT,
    "adicionadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteGrupoMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroContatoHistorico" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAnterior" TIMESTAMP(3),
    "valorNovo" TIMESTAMP(3),
    "origem" TEXT NOT NULL,
    "grupoId" TEXT,
    "interacaoId" TEXT,
    "motivo" TEXT,
    "autorUserId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroContatoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SugestaoExtraida" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "reuniaoId" TEXT NOT NULL,
    "importacaoId" TEXT,
    "destino" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "valorSugerido" TEXT NOT NULL,
    "valorEditado" TEXT,
    "trecho" TEXT,
    "confianca" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "decididoPor" TEXT,
    "decididoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SugestaoExtraida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarefaCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "reuniaoId" TEXT,
    "sugestaoId" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "responsavel" TEXT NOT NULL,
    "responsavelPessoaId" TEXT,
    "prazo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "concluidaEm" TIMESTAMP(3),
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarefaCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampoProveniencia" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "valorResumo" TEXT,
    "reuniaoId" TEXT,
    "sugestaoId" TEXT,
    "autorUserId" TEXT,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampoProveniencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClienteGrupo_nome_idx" ON "ClienteGrupo"("nome");

-- CreateIndex
CREATE INDEX "ClienteGrupoMembro_clienteId_idx" ON "ClienteGrupoMembro"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteGrupoMembro_grupoId_clienteId_key" ON "ClienteGrupoMembro"("grupoId", "clienteId");

-- CreateIndex
CREATE INDEX "RegistroContatoHistorico_clienteId_criadoEm_idx" ON "RegistroContatoHistorico"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "RegistroContatoHistorico_grupoId_idx" ON "RegistroContatoHistorico"("grupoId");

-- CreateIndex
CREATE INDEX "SugestaoExtraida_clienteId_status_idx" ON "SugestaoExtraida"("clienteId", "status");

-- CreateIndex
CREATE INDEX "SugestaoExtraida_reuniaoId_idx" ON "SugestaoExtraida"("reuniaoId");

-- CreateIndex
CREATE UNIQUE INDEX "TarefaCliente_sugestaoId_key" ON "TarefaCliente"("sugestaoId");

-- CreateIndex
CREATE INDEX "TarefaCliente_clienteId_status_idx" ON "TarefaCliente"("clienteId", "status");

-- CreateIndex
CREATE INDEX "TarefaCliente_prazo_idx" ON "TarefaCliente"("prazo");

-- CreateIndex
CREATE INDEX "CampoProveniencia_clienteId_idx" ON "CampoProveniencia"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "CampoProveniencia_clienteId_campo_key" ON "CampoProveniencia"("clienteId", "campo");

-- AddForeignKey
ALTER TABLE "ClienteGrupoMembro" ADD CONSTRAINT "ClienteGrupoMembro_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "ClienteGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteGrupoMembro" ADD CONSTRAINT "ClienteGrupoMembro_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroContatoHistorico" ADD CONSTRAINT "RegistroContatoHistorico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SugestaoExtraida" ADD CONSTRAINT "SugestaoExtraida_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SugestaoExtraida" ADD CONSTRAINT "SugestaoExtraida_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "ReuniaoEstruturada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SugestaoExtraida" ADD CONSTRAINT "SugestaoExtraida_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "ReuniaoImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarefaCliente" ADD CONSTRAINT "TarefaCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarefaCliente" ADD CONSTRAINT "TarefaCliente_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "ReuniaoEstruturada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarefaCliente" ADD CONSTRAINT "TarefaCliente_responsavelPessoaId_fkey" FOREIGN KEY ("responsavelPessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampoProveniencia" ADD CONSTRAINT "CampoProveniencia_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampoProveniencia" ADD CONSTRAINT "CampoProveniencia_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "ReuniaoEstruturada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
