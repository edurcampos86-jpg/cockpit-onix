-- ============================================================================
-- ComissaoMensalCliente — parar de jogar fora a comissão mensal do BTG
-- ============================================================================
--
-- ADITIVA. Cria uma tabela nova e não toca em nenhuma existente. Nada é
-- removido, nada é migrado, nada é backfillado. `ClienteBackoffice.receitaAnual`
-- e `ReceitaItem` seguem exatamente como estão.
--
-- ── ROLLBACK ──────────────────────────────────────────────────────────────
--   DROP TABLE "ComissaoMensalCliente";
-- e nada mais. A tabela nasce vazia e nenhuma outra passa a depender dela.
--
-- ── DOIS `DROP INDEX` FORAM REMOVIDOS DESTE ARQUIVO À MÃO ─────────────────
-- O `prisma migrate diff` emitiu, além do CREATE TABLE:
--
--   DROP INDEX "PainelEmailAI_tsv_idx";
--   ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;
--   DROP INDEX "Empresa_consolida_idx";
--
-- Nenhum tem a ver com esta mudança. Os dois primeiros são o drift conhecido
-- do índice FTS, que o Prisma não enxerga e reemite em TODA migration desta
-- série — `scripts/guarda-drift-fts.sh` existe para trancar exatamente isso, e
-- é a décima vez que a remoção é feita à mão.
--
-- O terceiro é drift da #373: `Empresa_consolida_idx` existe no banco e não
-- está declarado no schema. Deixá-lo aqui apagaria, em silêncio, um índice de
-- outra PR. Também sai — e o conserto de verdade (declarar `@@index`
-- ([consolida]) no schema) é PR de quem cuida do organograma, não desta.

-- ── A tabela ─────────────────────────────────────────────────────────────
CREATE TABLE "ComissaoMensalCliente" (
    "id"           TEXT           NOT NULL,
    "clienteId"    TEXT           NOT NULL,
    "competencia"  TEXT           NOT NULL,
    "comissao"     DECIMAL(14,2)  NOT NULL,
    "fonte"        TEXT           NOT NULL,
    "importadoEm"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origemSyncId" TEXT,
    "criadoEm"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "ComissaoMensalCliente_pkey" PRIMARY KEY ("id")
);

-- ── Formato da competência, imposto pelo banco ────────────────────────────
--
-- `competencia` é TEXT e ordena lexicograficamente na mesma ordem cronológica
-- — mas SÓ se o formato for sempre `AAAA-MM`. Uma linha com "2026-8" ou
-- "08/2026" quebra o ORDER BY e o BETWEEN em silêncio, e o erro aparece num
-- total, não numa exceção.
--
-- O CHECK é o único lugar que garante isso para TODO escritor, inclusive o
-- `psql` de alguém no console. Validação em TypeScript protege um caminho; o
-- banco protege todos. Mesma postura dos CHECKs de
-- `20260812205040_acordo_comercial_parceiro`.
ALTER TABLE "ComissaoMensalCliente"
  ADD CONSTRAINT "ComissaoMensalCliente_competencia_formato"
  CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- Comissão negativa é estorno e existe de verdade em relatório de corretora;
-- por isso o CHECK NÃO exige `>= 0`. O que ele exige é que o mês seja um mês.

-- ── Índices ───────────────────────────────────────────────────────────────

-- "Quanto a carteira gerou neste mês?" — a leitura do portal do parceiro.
CREATE INDEX "ComissaoMensalCliente_competencia_idx"
  ON "ComissaoMensalCliente"("competencia");

-- A série de um cliente, em ordem.
CREATE INDEX "ComissaoMensalCliente_clienteId_competencia_idx"
  ON "ComissaoMensalCliente"("clienteId", "competencia");

-- IDEMPOTÊNCIA: reimportar a mesma competência atualiza, não duplica. Sem
-- isto, rodar o enrich duas vezes no mesmo dia dobraria a receita do mês — e o
-- erro só apareceria na soma, depois.
--
-- `fonte` entra na chave porque duas fontes podem reportar a MESMA competência
-- com números diferentes; colapsar as duas apagaria justamente a divergência
-- que precisa ser vista.
CREATE UNIQUE INDEX "ComissaoMensalCliente_clienteId_competencia_fonte_key"
  ON "ComissaoMensalCliente"("clienteId", "competencia", "fonte");

-- ── FK ────────────────────────────────────────────────────────────────────
--
-- RESTRICT, não CASCADE: apagar um cliente não pode apagar o registro de
-- quanto ele gerou. Mesmo contrato de reter de `ContratoCorretora`.
--
-- Consequência conhecida e deliberada: `merge-leading-zeros.ts` apaga o
-- cliente antigo no passo 6, e o guarda do passo 5 só enxerga filhos CASCADE
-- (a consulta filtra `confdeltype = 'c'`). Com linhas aqui, o DELETE falha com
-- violação de FK e a transação inteira reverte — modo de falha SEGURO. O
-- contrário apagaria histórico financeiro em silêncio.
ALTER TABLE "ComissaoMensalCliente"
  ADD CONSTRAINT "ComissaoMensalCliente_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
