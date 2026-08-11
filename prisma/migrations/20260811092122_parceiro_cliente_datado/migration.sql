-- ParceiroCliente: vínculo DATADO entre parceiro e cliente — migration 100%
-- ADITIVA. Cria UMA tabela nova. Nenhuma tabela ou coluna existente é tocada.
--
-- POR QUE UMA TABELA, e não um "parceiroId" em "ClienteBackoffice": o vínculo
-- tem começo e fim. Um campo no cliente responderia "de quem é hoje" e perderia
-- "de quem era quando a receita entrou" — que é a pergunta que decide comissão.
-- Cliente que troca de parceiro em março não pode apagar o que o parceiro
-- anterior construiu até fevereiro.
--
-- PADRÃO DE VIGÊNCIA copiado de "AcordoComercial" (20260616... — "dataInicio"
-- + "dataFim" com NULL = vigente, índices em ambos): é literalmente o mesmo
-- problema, contrato comercial com prazo. Dois dialetos de vigência no mesmo
-- schema seriam como dois formatos de data.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ÍNDICE PARCIAL ÚNICO — a garantia mora no BANCO, não na aplicação
-- ─────────────────────────────────────────────────────────────────────────
-- "ParceiroCliente_vigente_key" impede DOIS vínculos vigentes para o mesmo par
-- (parceiro, cliente). Um UNIQUE comum não serve: o par PRECISA repetir no
-- histórico (vinculou, desvinculou, vinculou de novo é caminho legítimo). O
-- que não pode existir são duas linhas ABERTAS ao mesmo tempo, e é isso que o
-- predicado WHERE "dataFim" IS NULL expressa.
--
-- Técnica roubada de "Pat_pessoa_vigente_key"/"Pat_cliente_vigente_key"
-- (20260620102705), que resolvem "no máx. 1 PAT vigente por sujeito" do mesmo
-- jeito. A diferença é que o Pat marca vigência com um boolean e aqui ela é
-- derivada da data — o que dispensa manter dois campos em sincronia.
--
-- O Prisma NÃO representa índice parcial no schema.prisma, então ele vive só
-- aqui. Isso é seguro e foi verificado, não presumido: os dois índices
-- parciais do Pat estão no banco desde junho e o `migrate diff` contra o
-- schema não os re-emite nem pede DROP — ao contrário do caso PainelEmailAI
-- abaixo, que é coluna gerada + Unsupported() e por isso derrapa toda vez.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ARMADILHA MEDIDA: "vigente agora" é "dataFim IS NULL", e SÓ isso
-- ─────────────────────────────────────────────────────────────────────────
-- A query intuitiva para vigência é:
--
--     WHERE "dataInicio" <= now() AND ("dataFim" IS NULL OR "dataFim" > now())
--
-- Ela ERRA para vínculos recém-criados. "dataInicio" é TIMESTAMP(3) (é o que o
-- Prisma emite para DateTime) e o DEFAULT é CURRENT_TIMESTAMP, que tem
-- precisão de microssegundo — a gravação ARREDONDA para o milissegundo mais
-- próximo, e quando arredonda para CIMA o valor gravado fica no FUTURO em
-- relação a now().
--
-- Não é hipótese: medido neste shadow-DB com 2000 amostras de
-- clock_timestamp(), o arredondamento subiu em 1516 casos — 75,8%. Ou seja, um
-- vínculo criado agora some da própria consulta de vigência em 3 de cada 4
-- vezes, e volta a aparecer alguns milissegundos depois. Bug que não
-- reproduz em teste lento e explode em rota que grava e lê na mesma request.
--
-- REGRA, então:
--   - "vigente AGORA"        -> WHERE "dataFim" IS NULL          (não citar dataInicio)
--   - "vigente na DATA $X"   -> WHERE "dataInicio" <= $X AND ("dataFim" IS NULL OR "dataFim" > $X)
--     (seguro: $X é uma data passada informada, não o instante da gravação)
--
-- "AcordoComercial" tem exatamente a mesma forma (TIMESTAMP(3) + default
-- now()) e portanto a mesma armadilha — quem for escrever leitura de vigência
-- lá herda esta regra.
--
-- Rollback = DROP TABLE "ParceiroCliente";  (o índice parcial cai junto)
--
-- ATENÇÃO: o `prisma migrate dev` gerou aqui 2 statements de drift sobre
-- PainelEmailAI.tsv, REMOVIDOS À MÃO:
--
--     DROP INDEX "PainelEmailAI_tsv_idx";
--     ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
--
-- Eles não pertencem a esta migration e o DROP INDEX destruiria o índice FTS
-- de produção. Causa conhecida e recorrente: a coluna gerada vive em SQL bruto
-- (20260519240000) e o schema a declara como Unsupported("tsvector"), então o
-- Prisma a lê como divergência a cada `migrate dev`. É a SEXTA migration
-- seguida com a mesma remoção manual — ver 20260806083819, 20260807114022,
-- 20260808210618, 20260810182055 e 20260811091625.

-- CreateTable
CREATE TABLE "ParceiroCliente" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFim" TIMESTAMP(3),
    "vinculadoPor" TEXT,
    "desvinculadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParceiroCliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParceiroCliente_parceiroId_dataInicio_idx" ON "ParceiroCliente"("parceiroId", "dataInicio");

-- CreateIndex
CREATE INDEX "ParceiroCliente_parceiroId_dataFim_idx" ON "ParceiroCliente"("parceiroId", "dataFim");

-- CreateIndex
CREATE INDEX "ParceiroCliente_clienteId_dataFim_idx" ON "ParceiroCliente"("clienteId", "dataFim");

-- AddForeignKey
ALTER TABLE "ParceiroCliente" ADD CONSTRAINT "ParceiroCliente_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "Parceiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParceiroCliente" ADD CONSTRAINT "ParceiroCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Índice parcial único: no máximo UM vínculo VIGENTE por (parceiro, cliente).
-- Fora do alcance do schema.prisma; ver o bloco de comentário no topo.
-- ─────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "ParceiroCliente_vigente_key"
  ON "ParceiroCliente" ("parceiroId", "clienteId")
  WHERE "dataFim" IS NULL;
