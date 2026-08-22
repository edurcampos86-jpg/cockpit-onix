-- Onix Corretora — "ContratoCorretora" e "PerfilImportacao".
--
-- Migration 100% ADITIVA: cria DUAS tabelas novas e nada mais. Nenhuma tabela
-- existente é alterada, nenhuma coluna é removida ou renomeada, nenhum NOT NULL
-- é acrescentado a coluna existente. "ClienteBackoffice" e "PessoaGrupo" não
-- são tocadas — os campos de relação declarados nelas no schema são lados
-- inversos, que o Prisma resolve em tempo de query e não geram SQL.
--
-- ─────────────────────────────────────────────────────────────────────────
-- DRIFT REMOVIDO À MÃO — "PainelEmailAI_tsv_idx"
-- ─────────────────────────────────────────────────────────────────────────
-- O `prisma migrate dev` gerou, no topo deste arquivo, duas linhas que NÃO
-- pertencem a esta mudança e que foram removidas manualmente:
--
--     DROP INDEX "PainelEmailAI_tsv_idx";
--     ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
--
-- Por que elas aparecem: o índice full-text e o default de `tsv` foram criados
-- por SQL fora do modelo declarativo do Prisma (o schema não tem como declarar
-- índice GIN sobre tsvector nem `DEFAULT` de expressão). Toda migration nova
-- percebe a diferença entre "o que o schema descreve" e "o que o banco tem", e
-- propõe apagar o que não sabe explicar.
--
-- Por que remover: aplicar isso DERRUBARIA a busca full-text de PainelEmailAI
-- em produção — um efeito colateral sem relação nenhuma com a Corretora, numa
-- migration que roda dentro do `startCommand` (`prisma migrate deploy &&
-- next start`), onde falha de dado vira indisponibilidade.
--
-- É drift CONHECIDO e recorrente: sete migrations anteriores deste repositório
-- passaram pela mesma remoção manual, e `scripts/guarda-drift-fts.sh` reprova
-- no CI qualquer migration que deixe o DROP passar.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE O VÍNCULO É COM "PessoaGrupo", E NÃO COM "ClienteBackoffice"
-- ─────────────────────────────────────────────────────────────────────────
-- A Corretora tem clientes EXCLUSIVOS dela: gente que nunca abriu conta no
-- BTG. Pendurar o contrato em "ClienteBackoffice" obrigaria a criar uma conta
-- fantasma para cada um deles — e "ClienteBackoffice" tem `numeroConta` como
-- eixo do import e `assessorCge` como eixo do RBAC, dois campos que essa
-- pessoa não tem.
--
-- "PessoaGrupo" é a identidade acima das empresas do grupo: basta o CPF/CNPJ.
-- Cliente só da Corretora entra naturalmente, e cliente das duas casas fica
-- ligado às duas por construção, sem coluna de junção nova.
--
-- ─────────────────────────────────────────────────────────────────────────
-- NENHUMA ESCRITA DE DADO
-- ─────────────────────────────────────────────────────────────────────────
-- Sem seed, sem backfill, sem UPDATE. As duas tabelas nascem VAZIAS e nada no
-- app as lê ou escreve ainda. O import e as telas são PRs próprias.

-- CreateTable
CREATE TABLE "ContratoCorretora" (
    "id" TEXT NOT NULL,
    "pessoaGrupoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipoProduto" TEXT NOT NULL,
    "parceiro" TEXT NOT NULL,
    "numeroContrato" TEXT NOT NULL,
    "inicioVigencia" TIMESTAMP(3) NOT NULL,
    "fimVigencia" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "premio" DECIMAL(14,2),
    "comissao" DECIMAL(14,2),
    "atendenteCorretora" TEXT,
    "assessorCge" TEXT,
    "parceiroId" TEXT,
    "dadosProduto" JSONB,
    "perfilImportacaoId" TEXT,
    "loteImportacao" TEXT,
    "arquivoOrigem" TEXT,
    "linhaOrigem" INTEGER,
    "importadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContratoCorretora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilImportacao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "extracao" JSONB NOT NULL,
    "mapeamentoColunas" JSONB NOT NULL,
    "formatosValor" JSONB NOT NULL,
    "dicionarios" JSONB NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContratoCorretora_pessoaGrupoId_idx" ON "ContratoCorretora"("pessoaGrupoId");

-- CreateIndex
CREATE INDEX "ContratoCorretora_empresaId_status_idx" ON "ContratoCorretora"("empresaId", "status");

-- CreateIndex
CREATE INDEX "ContratoCorretora_atendenteCorretora_status_idx" ON "ContratoCorretora"("atendenteCorretora", "status");

-- CreateIndex
CREATE INDEX "ContratoCorretora_status_fimVigencia_idx" ON "ContratoCorretora"("status", "fimVigencia");

-- CreateIndex
CREATE INDEX "ContratoCorretora_assessorCge_status_idx" ON "ContratoCorretora"("assessorCge", "status");

-- CreateIndex
CREATE INDEX "ContratoCorretora_tipoProduto_status_idx" ON "ContratoCorretora"("tipoProduto", "status");

-- CreateIndex
CREATE INDEX "ContratoCorretora_parceiroId_idx" ON "ContratoCorretora"("parceiroId");

-- CreateIndex
CREATE INDEX "ContratoCorretora_perfilImportacaoId_idx" ON "ContratoCorretora"("perfilImportacaoId");

-- CreateIndex
CREATE INDEX "ContratoCorretora_loteImportacao_idx" ON "ContratoCorretora"("loteImportacao");

-- CreateIndex
CREATE INDEX "PerfilImportacao_empresaId_ativo_idx" ON "PerfilImportacao"("empresaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilImportacao_empresaId_nome_key" ON "PerfilImportacao"("empresaId", "nome");

-- AddForeignKey
ALTER TABLE "ContratoCorretora" ADD CONSTRAINT "ContratoCorretora_pessoaGrupoId_fkey" FOREIGN KEY ("pessoaGrupoId") REFERENCES "PessoaGrupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoCorretora" ADD CONSTRAINT "ContratoCorretora_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoCorretora" ADD CONSTRAINT "ContratoCorretora_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "Parceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoCorretora" ADD CONSTRAINT "ContratoCorretora_perfilImportacaoId_fkey" FOREIGN KEY ("perfilImportacaoId") REFERENCES "PerfilImportacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilImportacao" ADD CONSTRAINT "PerfilImportacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
