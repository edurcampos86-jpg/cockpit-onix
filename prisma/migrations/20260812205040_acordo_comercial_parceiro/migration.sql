-- AcordoComercialParceiro — acordo de comissão do parceiro, datado e por tipo
-- de produto. Migration 100% ADITIVA: cria UMA tabela nova. Nenhuma tabela ou
-- coluna existente é tocada.
--
-- ─────────────────────────────────────────────────────────────────────────
-- TABELA IRMÃ de "AcordoComercial", e não extensão dela
-- ─────────────────────────────────────────────────────────────────────────
-- "AcordoComercial" é o acordo da PESSOA do time. Não foi estendido para
-- aceitar parceiro por cinco razões, todas verificadas no código:
--
--   1. "AcordoComercial"."pessoaId" é NOT NULL com ON DELETE CASCADE, e seis
--      call sites em src/app/actions/acordo-comercial.ts assumem que existe.
--      Torná-lo nullable criaria um XOR polimórfico (padrão "Pat") e
--      ambiguizaria toda query atual.
--   2. "AcordoComercial" NÃO TEM campo de percentual — é "tipo" +
--      "regrasEspeciais" em texto livre. O acordo de parceiro precisa de
--      número por produto: forma diferente, não coluna nullable a mais.
--   3. A cardinalidade diverge. Pessoa tem UM acordo vigente; parceiro tem um
--      vigente POR tipo de produto, vários ao mesmo tempo.
--   4. `atualizarAcordo` (acordo-comercial.ts:147) faz UPDATE no lugar, o que
--      viola frontalmente a regra (b) abaixo. Reusar o model herdaria esse
--      caminho de escrita.
--   5. "AcordoComercial" tem relação 1:1 com "ContratoArquivo" do jurídico;
--      compartilhar entrelaçaria comissão de parceiro com o fluxo de contratos.
--
-- ─────────────────────────────────────────────────────────────────────────
-- AS TRÊS REGRAS DE NEGÓCIO, e o que no banco as sustenta
-- ─────────────────────────────────────────────────────────────────────────
-- (a) ACORDOS INDEPENDENTES. A Onix paga assessor e parceiro separadamente
--     sobre a mesma comissão líquida, e o acordo de um não altera o do outro.
--     Tabelas separadas tornam isso ESTRUTURAL: não existe campo compartilhado
--     que um lado possa mexer e afetar o outro.
--
-- (b) VALE O PERCENTUAL DA DATA DO FATO GERADOR, nunca o do fechamento. A
--     linha é datada e o percentual NUNCA sofre UPDATE: alterar FECHA a
--     vigente ("dataFim") e ABRE outra. Um UPDATE no lugar reescreveria o
--     passado — o fechamento de março passaria a usar o percentual de junho, e
--     nada no banco registraria que mudou.
--
--     O banco não consegue proibir UPDATE de "percentual" sem um trigger, e
--     esta PR não instala um: a tabela nasce vazia e sem rota, então o
--     primeiro caminho de escrita ainda vai ser escrito — é lá que a regra é
--     barata de garantir. Se aparecer rota que edite percentual no lugar, a
--     resposta certa é trigger, não revisão de código.
--
-- (c) PERCENTUAL VARIA POR TIPO DE PRODUTO (seguro resgatável ≠ assessoria).
--     Por isso o índice parcial único é por (parceiroId, tipoProduto): um
--     parceiro tem VÁRIOS acordos abertos ao mesmo tempo, um por produto.
--
-- ─────────────────────────────────────────────────────────────────────────
-- DECIMAL, e não Float — primeiro do schema, de propósito
-- ─────────────────────────────────────────────────────────────────────────
-- "percentual" é a taxa que multiplica dinheiro, e o problema do Float aqui
-- NÃO é a leitura — é a ARITMÉTICA. Vale ser preciso, porque a intuição erra:
-- o Postgres imprime float8 pela representação mais curta que faz round-trip,
-- então `40.15::float8` volta como "40.15" e uma inspeção casual não revela
-- nada. Medido neste shadow-DB:
--
--     0.1 + 0.2 = 0.3          -> float8: FALSE      numeric: TRUE
--     20.1 + 20.1 + 20.1       -> float8: 60.300000000000004
--                                 numeric: 60.3
--
-- São exatamente as duas operações que um acordo de comissão faz: COMPARAR
-- taxas (esta é a mesma do acordo anterior?) e SOMAR taxas (assessor +
-- parceiros fecham 100%?). Com Float, uma validação de soma == 100 reprova um
-- rateio correto, e a mensagem de erro mostra "100" na tela.
--
-- O resto do schema usa Float para dinheiro (saldo, receitaAnual). A diferença
-- é intencional e o momento de introduzir o tipo é este: a tabela nasce vazia e
-- sem leitores, então não há consumidor para quebrar. Quem ler depois recebe um
-- objeto Decimal do Prisma (decimal.js), não um number.
--
-- ─────────────────────────────────────────────────────────────────────────
-- OS DOIS CHECKs — invariantes que a aplicação não deve ter de lembrar
-- ─────────────────────────────────────────────────────────────────────────
-- "percentual_faixa": 0 <= percentual <= 100. Guardamos 0–100 (40.0000 = 40%),
-- não fração. Sem isto, gravar 0.40 achando que é 40% passa despercebido e o
-- parceiro recebe 0,4% — erro que só aparece no extrato dele.
--
-- "vigencia_coerente": dataFim IS NULL OR dataFim >= dataInicio. Um acordo que
-- termina antes de começar não é vigente em data nenhuma; a linha ficaria
-- invisível a toda consulta por data e ninguém saberia por quê.
--
-- CHECK não é representável no schema.prisma (mesma limitação do índice
-- parcial), então os três vivem só aqui. Verificado em shadow-DB que isso não
-- gera drift: o `migrate diff` não re-emite CHECK nem índice parcial — mesmo
-- comportamento dos índices parciais do "Pat" (20260620102705) e do CHECK XOR
-- da mesma migration.
--
-- SEM BACKFILL: a tabela nasce VAZIA e NADA no app a lê.
--
-- Rollback = DROP TABLE "AcordoComercialParceiro";
--            (índice parcial e CHECKs caem junto)
--
-- ATENÇÃO: o `prisma migrate dev` gerou aqui 2 statements de drift sobre
-- PainelEmailAI.tsv, REMOVIDOS À MÃO:
--
--     DROP INDEX "PainelEmailAI_tsv_idx";
--     ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
--
-- Eles não pertencem a esta migration e o DROP INDEX destruiria o índice FTS
-- de produção. É a OITAVA migration seguida com a mesma remoção manual — desde
-- a #311 há teste automatizado da guarda (scripts/guarda-drift-fts.sh), então
-- esquecer passou a reprovar o CI em vez de chegar em produção.

-- CreateTable
CREATE TABLE "AcordoComercialParceiro" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "tipoProduto" TEXT NOT NULL,
    "percentual" DECIMAL(7,4) NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFim" TIMESTAMP(3),
    "criadoPor" TEXT,
    "encerradoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcordoComercialParceiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcordoComercialParceiro_parceiroId_dataInicio_idx" ON "AcordoComercialParceiro"("parceiroId", "dataInicio");

-- CreateIndex
CREATE INDEX "AcordoComercialParceiro_parceiroId_dataFim_idx" ON "AcordoComercialParceiro"("parceiroId", "dataFim");

-- CreateIndex
CREATE INDEX "AcordoComercialParceiro_tipoProduto_idx" ON "AcordoComercialParceiro"("tipoProduto");

-- AddForeignKey
ALTER TABLE "AcordoComercialParceiro" ADD CONSTRAINT "AcordoComercialParceiro_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "Parceiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Índice parcial único: no máximo UM acordo VIGENTE por (parceiro, produto).
-- Fora do alcance do schema.prisma; ver o bloco de comentário no topo.
-- ─────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "AcordoComercialParceiro_vigente_key"
  ON "AcordoComercialParceiro" ("parceiroId", "tipoProduto")
  WHERE "dataFim" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- CHECKs. Ver o bloco de comentário no topo.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "AcordoComercialParceiro"
  ADD CONSTRAINT "AcordoComercialParceiro_percentual_faixa"
  CHECK ("percentual" >= 0 AND "percentual" <= 100);

ALTER TABLE "AcordoComercialParceiro"
  ADD CONSTRAINT "AcordoComercialParceiro_vigencia_coerente"
  CHECK ("dataFim" IS NULL OR "dataFim" >= "dataInicio");
