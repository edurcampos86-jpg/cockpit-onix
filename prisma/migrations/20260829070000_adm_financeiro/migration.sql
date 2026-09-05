-- ═══════════════════════════════════════════════════════════════════════════
-- ADM/FINANCEIRO — a receita de todas as empresas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Desenho aprovado pelo Eduardo em 29/08/2026. `docs/onix-financeiro-modelo.md`
-- explica cada decisão; aqui fica o que só o SQL mostra.
--
-- ── ESTA MIGRATION É ADITIVA. NADA EXISTENTE É RENOMEADO NEM REMOVIDO ─────
--
-- Cinco tabelas novas, UMA coluna nova numa tabela existente
-- (`PerfilImportacao.destino`, com DEFAULT), e um backfill que COPIA — não
-- move — o conteúdo de `ComissaoMensalCliente`.
--
-- Nenhum DROP. Nenhum RENAME. Nenhuma coluna existente muda de tipo ou de
-- nulidade. Isso importa por causa do mecanismo de deploy deste projeto:
-- `prisma migrate deploy` roda dentro do `startCommand` (`railway.toml`, bloco
-- `[deploy]`), então durante a janela de deploy o container ANTIGO ainda serve
-- requisições enquanto o novo migra. Migration aditiva é invisível para o
-- código velho; qualquer rename seria 500 em toda leitura dele.
--
-- ── O QUE FICOU DE FORA, E POR QUÊ ───────────────────────────────────────
--
-- 1. `ContratoCorretora` → `Contrato`. A proposta previa; sai em PR PRÓPRIA,
--    pela janela de deploy acima. É o que a contagem de `ContratoCorretora`
--    decide: vazia, ninguém lê e a janela é inofensiva; com dado, são 500s.
--    O `ALTER TABLE ... RENAME` leva as chaves estrangeiras junto, então
--    `ParcelaReceita.contratoId` — que aponta para `ContratoCorretora` aqui —
--    não precisa ser tocada lá.
--
-- 2. `MetaMensal`. A proposta sugeria acrescentar `empresaId` e trocar o
--    UNIQUE de `(mes, ano)` para `(empresaId, mes, ano)`. Está ERRADO e o erro
--    é sutil: no Postgres NULL é DISTINTO de NULL em índice único, então as
--    linhas legadas (`empresaId` nulo) deixariam de ser protegidas e duas
--    metas do mesmo mês passariam as duas. O conserto seria um índice único
--    PARCIAL, que o Prisma não declara no schema e que viraria drift em toda
--    migration seguinte — a dor conhecida do `PainelEmailAI_tsv_idx`.
--
-- 3. `DROP` de `ComissaoMensalCliente` e de `ReceitaItem`. A primeira tem o
--    dado copiado aqui e fica CONGELADA como testemunha; a segunda está vazia.
--    Os dois `DROP` são PR separada, depois de o caminho novo rodar em
--    produção pelo menos uma vez.
--
-- ── LEMBRETE OPERACIONAL ─────────────────────────────────────────────────
-- Toda migration nova derruba espuriamente o índice `PainelEmailAI_tsv_idx`
-- (drift conhecido em 7+ migrations). Remover manualmente antes de aplicar.

-- AlterTable
ALTER TABLE "PerfilImportacao" ADD COLUMN     "destino" TEXT NOT NULL DEFAULT 'contrato_corretora';

-- CreateTable
CREATE TABLE "RegraReceita" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "periodicidade" TEXT NOT NULL,
    "quantidadeParcelas" INTEGER,
    "escada" JSONB NOT NULL,
    "parceiro" TEXT,
    "vigenteDe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenteAte" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraReceita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelaReceita" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "contratoId" TEXT,
    "regraReceitaId" TEXT,
    "competencia" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3),
    "ordem" INTEGER,
    "origem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prevista',
    "valorBruto" DECIMAL(14,2) NOT NULL,
    "imposto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorLiquido" DECIMAL(14,2) NOT NULL,
    "pessoaGrupoId" TEXT,
    "clienteId" TEXT,
    "pessoaId" TEXT,
    "parceiroId" TEXT,
    "produto" TEXT,
    "fonte" TEXT NOT NULL,
    "perfilImportacaoId" TEXT,
    "loteImportacao" TEXT,
    "arquivoOrigem" TEXT,
    "linhaOrigem" INTEGER,
    "importadoEm" TIMESTAMP(3),
    "hashOrigem" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParcelaReceita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Premiacao" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "empresaId" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "metrica" TEXT NOT NULL,
    "tipoProduto" TEXT,
    "metaGrupo" DECIMAL(14,2),
    "metaPorPessoa" DECIMAL(14,2),
    "reguaPremio" JSONB NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Premiacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PremiacaoApuracao" (
    "id" TEXT NOT NULL,
    "premiacaoId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "realizado" DECIMAL(14,2) NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "degrauAtingido" INTEGER,
    "premioDevido" DECIMAL(14,2),
    "apuradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "congeladaEm" TIMESTAMP(3),
    "congeladaPor" TEXT,

    CONSTRAINT "PremiacaoApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoDespesa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3),
    "categoria" TEXT NOT NULL,
    "descricao" TEXT,
    "fornecedor" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prevista',
    "fonte" TEXT NOT NULL,
    "hashOrigem" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LancamentoDespesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegraReceita_empresaId_ativa_idx" ON "RegraReceita"("empresaId", "ativa");

-- CreateIndex
CREATE UNIQUE INDEX "RegraReceita_empresaId_nome_vigenteDe_key" ON "RegraReceita"("empresaId", "nome", "vigenteDe");

-- CreateIndex
CREATE UNIQUE INDEX "ParcelaReceita_hashOrigem_key" ON "ParcelaReceita"("hashOrigem");

-- CreateIndex
CREATE INDEX "ParcelaReceita_empresaId_competencia_status_idx" ON "ParcelaReceita"("empresaId", "competencia", "status");

-- CreateIndex
CREATE INDEX "ParcelaReceita_competencia_origem_idx" ON "ParcelaReceita"("competencia", "origem");

-- CreateIndex
CREATE INDEX "ParcelaReceita_pessoaId_competencia_idx" ON "ParcelaReceita"("pessoaId", "competencia");

-- CreateIndex
CREATE INDEX "ParcelaReceita_parceiroId_competencia_idx" ON "ParcelaReceita"("parceiroId", "competencia");

-- CreateIndex
CREATE INDEX "ParcelaReceita_contratoId_ordem_idx" ON "ParcelaReceita"("contratoId", "ordem");

-- CreateIndex
CREATE INDEX "ParcelaReceita_status_vencimento_idx" ON "ParcelaReceita"("status", "vencimento");

-- CreateIndex
CREATE INDEX "ParcelaReceita_pessoaGrupoId_idx" ON "ParcelaReceita"("pessoaGrupoId");

-- CreateIndex
CREATE INDEX "ParcelaReceita_clienteId_idx" ON "ParcelaReceita"("clienteId");

-- CreateIndex
CREATE INDEX "ParcelaReceita_regraReceitaId_idx" ON "ParcelaReceita"("regraReceitaId");

-- CreateIndex
CREATE INDEX "ParcelaReceita_perfilImportacaoId_idx" ON "ParcelaReceita"("perfilImportacaoId");

-- CreateIndex
CREATE INDEX "ParcelaReceita_loteImportacao_idx" ON "ParcelaReceita"("loteImportacao");

-- CreateIndex
CREATE UNIQUE INDEX "ParcelaReceita_contratoId_competencia_ordem_origem_key" ON "ParcelaReceita"("contratoId", "competencia", "ordem", "origem");

-- CreateIndex
CREATE INDEX "Premiacao_parceiroId_inicio_idx" ON "Premiacao"("parceiroId", "inicio");

-- CreateIndex
CREATE INDEX "Premiacao_ativa_fim_idx" ON "Premiacao"("ativa", "fim");

-- CreateIndex
CREATE INDEX "Premiacao_empresaId_idx" ON "Premiacao"("empresaId");

-- CreateIndex
CREATE INDEX "PremiacaoApuracao_premiacaoId_realizado_idx" ON "PremiacaoApuracao"("premiacaoId", "realizado" DESC);

-- CreateIndex
CREATE INDEX "PremiacaoApuracao_pessoaId_idx" ON "PremiacaoApuracao"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "PremiacaoApuracao_premiacaoId_pessoaId_key" ON "PremiacaoApuracao"("premiacaoId", "pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "LancamentoDespesa_hashOrigem_key" ON "LancamentoDespesa"("hashOrigem");

-- CreateIndex
CREATE INDEX "LancamentoDespesa_empresaId_competencia_status_idx" ON "LancamentoDespesa"("empresaId", "competencia", "status");

-- CreateIndex
CREATE INDEX "LancamentoDespesa_competencia_idx" ON "LancamentoDespesa"("competencia");

-- AddForeignKey
ALTER TABLE "RegraReceita" ADD CONSTRAINT "RegraReceita_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "ContratoCorretora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_regraReceitaId_fkey" FOREIGN KEY ("regraReceitaId") REFERENCES "RegraReceita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_pessoaGrupoId_fkey" FOREIGN KEY ("pessoaGrupoId") REFERENCES "PessoaGrupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "Parceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_perfilImportacaoId_fkey" FOREIGN KEY ("perfilImportacaoId") REFERENCES "PerfilImportacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Premiacao" ADD CONSTRAINT "Premiacao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "Parceiro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Premiacao" ADD CONSTRAINT "Premiacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiacaoApuracao" ADD CONSTRAINT "PremiacaoApuracao_premiacaoId_fkey" FOREIGN KEY ("premiacaoId") REFERENCES "Premiacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiacaoApuracao" ADD CONSTRAINT "PremiacaoApuracao_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoDespesa" ADD CONSTRAINT "LancamentoDespesa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════
-- ACRESCENTADO À MÃO, DAQUI PARA BAIXO
-- ═══════════════════════════════════════════════════════════════════════════
-- Tudo acima saiu do `prisma migrate diff`. O Prisma não emite CHECK nem
-- backfill, e os dois são parte da decisão — não um detalhe de implementação.

-- ── 1. COMPETÊNCIA É UM MÊS, e o banco é quem garante ────────────────────
--
-- `"AAAA-MM"` só ordena lexicograficamente na ordem cronológica se o mês tiver
-- dois dígitos: "2026-9" viria DEPOIS de "2026-10". O CHECK é o único lugar
-- que vale para TODO escritor — inclusive um `psql` aberto às pressas.
--
-- Mesma expressão do CHECK que a `ComissaoMensalCliente` já carrega
-- (`20260824030000_comissao_mensal_cliente`), de propósito: duas regras
-- diferentes para o mesmo formato seriam duas verdades.
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_competencia_formato"
  CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "LancamentoDespesa" ADD CONSTRAINT "LancamentoDespesa_competencia_formato"
  CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- ── 2. O LÍQUIDO NÃO PODE SER MAIOR QUE O BRUTO ──────────────────────────
--
-- Imposto negativo não existe, e líquido > bruto é sinal de importação torta —
-- exatamente o tipo de linha que infla um total sem ninguém ver. Barrar na
-- escrita é mais barato que descobrir na soma.
--
-- `bruto - imposto = liquido` seria a regra estrita, e ela está ERRADA para o
-- caso real: alguns relatórios de parceiro trazem retenções que não são
-- imposto. A desigualdade é o que dá para afirmar.
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_valores_coerentes"
  CHECK ("imposto" >= 0 AND "valorLiquido" <= "valorBruto");

-- ── 3. VOCABULÁRIO: o que o banco recusa e o que ele deixa passar ────────
--
-- `origem` e `status` entram em CHECK; `tipo`, `periodicidade`, `metrica` e
-- `categoria` NÃO. A régua é a mesma do `tipoProduto`: o que muda por decisão
-- COMERCIAL fica em código, para não custar migration vermelha; o que é
-- ESTRUTURAL — e do que dependem as somas do consolidador e da premiação —
-- fica no banco.
--
-- Um `origem` escrito errado numa importação faria a parcela sumir de TODA
-- consulta filtrada, e o total sairia menor sem nenhum erro na tela. É a
-- classe de defeito que este projeto já pagou duas vezes.
ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_origem_conhecida"
  CHECK ("origem" IN ('projecao', 'apuracao', 'manual'));

ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_status_conhecido"
  CHECK ("status" IN ('prevista', 'recebida', 'cancelada', 'inadimplente'));

ALTER TABLE "LancamentoDespesa" ADD CONSTRAINT "LancamentoDespesa_status_conhecido"
  CHECK ("status" IN ('prevista', 'paga', 'cancelada', 'atrasada'));

-- ── 4. O ÍNDICE QUE O CONSOLIDADOR USA, E QUE O PRISMA NÃO DECLARA ───────
--
-- A consulta do grupo filtra `origem = 'apuracao' AND status = 'recebida'` e
-- soma por competência. Um índice PARCIAL sobre essa condição é uma fração do
-- tamanho do índice cheio.
--
-- NÃO está no `schema.prisma` porque o Prisma não declara índice parcial — e é
-- exatamente por isso que ele PRECISA estar comentado aqui: sem este bloco,
-- ele vira drift silencioso e alguma migration futura o derruba, como já
-- acontece com o `PainelEmailAI_tsv_idx`. Se este índice sumir de um `\d`, foi
-- drift, não decisão.
CREATE INDEX "ParcelaReceita_realizado_idx"
  ON "ParcelaReceita" ("competencia", "empresaId")
  WHERE "origem" = 'apuracao' AND "status" = 'recebida';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. BACKFILL — `ComissaoMensalCliente` → `ParcelaReceita`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O dado MIGRA. Não é recalculado e não se perde.
--
-- POR QUE NÃO RECALCULAR: `getCommissionReport()` — o endpoint do BTG em uso —
-- serve a competência CORRENTE, não o histórico. O que está gravado é a única
-- cópia daqueles meses. Recalcular seria trocar dado real por dado que a API
-- não tem mais.
--
-- POR QUE COPIAR E NÃO MOVER: a tabela de origem fica no ar, congelada, como
-- testemunha. Se algum número divergir depois, os dois lados existem para
-- comparar. O `DROP` é PR própria.
--
-- `empresaId = 'investimentos'`: toda linha de `ComissaoMensalCliente` é
-- comissão do BTG, e o BTG é a Onix Capital. O id é o slug estável de
-- `src/lib/empresas-config.ts`, o mesmo gravado em `Implementacao.empresaId`
-- desde o início.
--
-- `imposto = 0` e `valorLiquido = comissao`: a origem guarda UM número, sem
-- separar imposto. Inventar uma alíquota aqui seria fabricar dado — e o CHECK
-- de coerência acima aceita `liquido = bruto`.
--
-- `gen_random_uuid()::text` e não cuid: o `@default(cuid())` do Prisma é
-- gerado pela APLICAÇÃO, e SQL não tem como produzi-lo. A coluna é TEXT sem
-- formato imposto, então as linhas do backfill terão id em formato diferente
-- das que a aplicação criar. É cosmético e está dito aqui para ninguém achar
-- que é corrupção — e é um marcador útil: `id NOT LIKE 'c%'` separa o que veio
-- do backfill do que nasceu depois.

-- ── 5a. O NÓ TEM DE EXISTIR ANTES ────────────────────────────────────────
--
-- Sem `Empresa('investimentos')`, o INSERT abaixo morre em violação de chave
-- estrangeira — mensagem críptica para um problema simples. Este bloco falha
-- ANTES, dizendo o quê. Só cobra quando há o que inserir: base sem comissão
-- não precisa do nó.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ComissaoMensalCliente")
     AND NOT EXISTS (SELECT 1 FROM "Empresa" WHERE "id" = 'investimentos') THEN
    RAISE EXCEPTION
      'Ha comissao para migrar, mas Empresa(id=''investimentos'') nao existe. '
      'Rode o seed das empresas antes desta migration.';
  END IF;
END $$;

INSERT INTO "ParcelaReceita" (
  "id", "empresaId", "competencia", "origem", "status",
  "valorBruto", "imposto", "valorLiquido",
  "clienteId", "fonte", "importadoEm", "criadoEm", "atualizadoEm"
)
SELECT
  gen_random_uuid()::text,
  'investimentos',
  c."competencia",
  'apuracao',
  'recebida',
  c."comissao",
  0,
  c."comissao",
  c."clienteId",
  c."fonte",
  c."importadoEm",
  c."criadoEm",
  c."atualizadoEm"
FROM "ComissaoMensalCliente" c;

-- ── 6. CONFERÊNCIA, DENTRO DA MESMA TRANSAÇÃO ────────────────────────────
--
-- Backfill sem conferência é fé, não verificação.
--
-- CONTAGEM **E** SOMA, e as duas são necessárias: só a contagem deixaria
-- passar um erro de conversão de valor; só a soma deixaria passar linhas
-- trocadas que se compensam.
--
-- Falhar aqui reverte a transação INTEIRA: as tabelas novas não existem, a
-- velha está intacta, e não há nada a restaurar de backup. É o modo de falha
-- que se quer — e é por isso que a conferência está AQUI e não num script
-- depois. Neste projeto, migration que falha no deploy derruba o serviço em
-- loop de restart; falhar limpo no shadow-DB, antes do merge, é o único lugar
-- barato de descobrir.
DO $$
DECLARE
  linhas_antes  bigint;
  linhas_depois bigint;
  soma_antes    numeric;
  soma_depois   numeric;
BEGIN
  SELECT count(*), coalesce(sum("comissao"), 0)
    INTO linhas_antes, soma_antes
    FROM "ComissaoMensalCliente";

  SELECT count(*), coalesce(sum("valorLiquido"), 0)
    INTO linhas_depois, soma_depois
    FROM "ParcelaReceita"
   WHERE "origem" = 'apuracao' AND "empresaId" = 'investimentos';

  IF linhas_antes <> linhas_depois THEN
    RAISE EXCEPTION
      'Backfill NAO fecha em CONTAGEM: % linhas na origem, % no destino.',
      linhas_antes, linhas_depois;
  END IF;

  IF soma_antes <> soma_depois THEN
    RAISE EXCEPTION
      'Backfill NAO fecha em SOMA: % na origem, % no destino (diferenca %).',
      soma_antes, soma_depois, soma_antes - soma_depois;
  END IF;

  RAISE NOTICE 'Backfill conferido: % linhas, soma %.', linhas_depois, soma_depois;
END $$;
