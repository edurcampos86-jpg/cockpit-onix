import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  escolherAgregadoComSlot,
  escolherCandidatoAgregado,
  SOURCE_RANK,
} from "@/lib/reunioes-core";

type ReuniaoExecutor = Pick<
  Prisma.TransactionClient,
  "reuniaoCliente" | "clienteBackoffice"
>;

/**
 * Camada unificada de reuniões — fonte da verdade pros agregados
 * `proximaReuniaoAt` / `ultimaReuniaoAt` em ClienteBackoffice.
 *
 * Por que essa camada existe:
 * - As 3 fontes externas (Google Calendar, Outlook ICS, Datacrazy Atividades)
 *   podem registrar a MESMA reunião. Sem chave externa, "última escrita ganha".
 * - `ReuniaoCliente` tem `(userId, source, externalId, clienteId)` unique →
 *   idempotência por fonte. Mesma reunião replicada em 2 fontes vira 2 linhas
 *   com `startAt` igual; o agregado deduplica via MIN/MAX no SQL.
 * - `clienteId` entra na chave porque UM evento pode casar com VÁRIOS clientes
 *   (reunião com casal, título citando dois nomes): cada match tem a própria
 *   linha. Antes da migration 20260730200000 eles dividiam uma linha só e se
 *   sobrescreviam — vencia o match de MENOR confiança, cujo score 30 é
 *   filtrado do rollup, então a reunião sumia das colunas de todos.
 *
 * Em empate exato de data no agregado, uma edição manual vence; entre fontes
 * externas preservamos google > outlook-ics > outlook-web > datacrazy.
 */

export type ReuniaoSource =
  | "google-cal"
  | "outlook-ics"
  | "outlook-web"
  | "datacrazy-atividade"
  | "manual";

export type ReuniaoMatchedVia =
  | "email"
  | "telefone"
  | "nome-unico"
  | "nome-substring"
  | "manual";

export const MATCH_SCORE: Record<ReuniaoMatchedVia, number> = {
  email: 100,
  telefone: 80,
  "nome-unico": 50,
  "nome-substring": 30,
  manual: 0,
};

/**
 * Confiança mínima pra um match PROMOVER os agregados
 * `proximaReuniaoAt` / `ultimaReuniaoAt` do cliente (FIX A).
 *
 * `nome-substring` (score 30) é recall agressivo e gera falso-positivo em
 * homônimos → fica GRAVADO em ReuniaoCliente (pra revisão / fase 2) mas
 * NÃO sobe pro rollup automaticamente. `manual` (score 0) é verdade humana
 * e sempre promove, apesar do score baixo.
 */
export const MIN_SCORE_ROLLUP = 50;

/**
 * Filtro Prisma: reuniões que têm confiança suficiente pra entrar no rollup.
 * score >= 50 (email/telefone/nome-unico) OU origem manual (humano).
 */
const ROLLUP_CONFIAVEL = {
  OR: [
    { matchScore: { gte: MIN_SCORE_ROLLUP } },
    { matchedVia: "manual" as ReuniaoMatchedVia },
  ],
};

export interface UpsertReuniaoInput {
  clienteId: string;
  source: ReuniaoSource;
  externalId: string;
  startAt: Date;
  endAt?: Date | null;
  titulo?: string | null;
  matchedVia: ReuniaoMatchedVia;
  rawPayload?: unknown;
  /**
   * Dono da reunião para fontes per-user (google-cal pós Fase 2).
   * `null` (default) para fontes globais legadas (outlook-ics admin único,
   * datacrazy-atividade). NUNCA misture: o unique `(userId, source, externalId)`
   * trata NULL como sentinela do escopo global.
   */
  userId?: string | null;
}

/**
 * Upsert idempotente de uma reunião. Marca como `realizada` se startAt já
 * passou no momento do upsert. Retorna se foi created/updated/noop pra
 * o caller decidir se precisa recomputar agregados.
 */
export async function upsertReuniao(
  input: UpsertReuniaoInput,
  db: ReuniaoExecutor = prisma,
): Promise<"created" | "updated" | "noop"> {
  const realizada = input.startAt < new Date();
  const matchScore = MATCH_SCORE[input.matchedVia];
  const userId = input.userId ?? null;

  // findUnique nao serve aqui: o Prisma rejeita `userId: null` no compound
  // unique (NULL nao satisfaz @unique no contrato JS). findFirst escopa
  // corretamente o "tipo global" via where literal.
  //
  // `clienteId` FAZ PARTE da busca: um mesmo evento pode casar com varios
  // clientes, e cada um tem a PROPRIA linha (unique inclui clienteId desde a
  // migration 20260730200000). Sem ele aqui, os matches do mesmo evento
  // encontrariam a linha um do outro e se sobrescreveriam em cadeia — a linha
  // acabava com o match de MENOR confianca e sumia do rollup.
  const existente = await db.reuniaoCliente.findFirst({
    where: {
      userId,
      source: input.source,
      externalId: input.externalId,
      clienteId: input.clienteId,
    },
  });

  if (!existente) {
    await db.reuniaoCliente.create({
      data: {
        clienteId: input.clienteId,
        userId,
        source: input.source,
        externalId: input.externalId,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        titulo: input.titulo ?? null,
        realizada,
        matchedVia: input.matchedVia,
        matchScore,
        rawPayload: (input.rawPayload as object | undefined) ?? undefined,
      },
    });
    return "created";
  }

  // Se nada relevante mudou, no-op (evita updatedAt churn no índice).
  //
  // `clienteId` saiu da comparação: agora é parte da chave de busca, então
  // sempre bate. Em troca entraram `matchedVia`/`matchScore` — antes eles eram
  // reescritos "de graça" a cada troca de dono da linha; com a linha estável
  // por cliente, sem compará-los um match que MELHORA (ex.: o cliente ganha
  // e-mail e passa de nome-substring/30 para email/100) cairia no no-op e o
  // score ficaria congelado abaixo do MIN_SCORE_ROLLUP — a reunião nunca
  // subiria pro rollup.
  const naoMudou =
    existente.startAt.getTime() === input.startAt.getTime() &&
    (existente.endAt?.getTime() ?? null) === (input.endAt?.getTime() ?? null) &&
    existente.titulo === (input.titulo ?? null) &&
    existente.realizada === realizada &&
    existente.matchedVia === input.matchedVia &&
    existente.matchScore === matchScore;
  if (naoMudou) return "noop";

  await db.reuniaoCliente.update({
    where: { id: existente.id },
    data: {
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      titulo: input.titulo ?? null,
      realizada,
      matchedVia: input.matchedVia,
      matchScore,
      rawPayload: (input.rawPayload as object | undefined) ?? undefined,
    },
  });
  return "updated";
}

/**
 * Remove uma reunião (quando o evento sumiu da fonte externa).
 * `userId` escopa para fontes per-user (default: global / NULL).
 *
 * Remove TODAS as linhas daquele `externalId` — o evento pode ter casado com
 * vários clientes, e cada um tem a própria linha. Retorna os `clienteId`
 * afetados (dedupados) para que o caller os passe INTEIROS pro recompute:
 * devolver só um booleano deixaria de fora os demais donos, que ficariam com
 * `proximaReuniaoAt`/`ultimaReuniaoAt` apontando pra uma reunião já deletada.
 */
export async function deleteReuniaoByExternal(
  source: ReuniaoSource,
  externalId: string,
  userId: string | null = null,
): Promise<{ removidas: number; clientesAfetados: string[] }> {
  // Lê antes de deletar: o deleteMany devolve só a contagem, e precisamos
  // saber DE QUEM eram as linhas pra recomputar os agregados deles.
  const alvos = await prisma.reuniaoCliente.findMany({
    where: { source, externalId, userId },
    select: { clienteId: true },
  });
  if (alvos.length === 0) return { removidas: 0, clientesAfetados: [] };

  const r = await prisma.reuniaoCliente.deleteMany({
    where: { source, externalId, userId },
  });
  return {
    removidas: r.count,
    clientesAfetados: Array.from(new Set(alvos.map((a) => a.clienteId))),
  };
}

/**
 * Recalcula `proximaReuniaoAt` e `ultimaReuniaoAt` do cliente a partir
 * da tabela ReuniaoCliente. Idempotente.
 *
 * - próxima = menor startAt onde startAt >= now()
 * - última = maior startAt onde startAt < now()
 *
 * Reuniões da mesma data em fontes diferentes (dedupe natural via MIN/MAX
 * sobre startAt — o valor é o mesmo, só conta uma vez).
 */
export async function recomputeAgregadosReuniao(
  clienteId: string,
  db: ReuniaoExecutor = prisma,
): Promise<{ proxima: Date | null; ultima: Date | null }> {
  const agora = new Date();

  // Só matches confiáveis (score >= 50 ou manual) promovem os agregados.
  // nome-substring (30) é ignorado aqui — fica gravado pra revisão.
  //
  // `source` e `matchedVia` entram no select para a procedência ser GRAVADA
  // junto da data, vinda da MESMA linha que venceu o desempate. Inferir isso
  // no render obrigaria a UI a repetir a regra de ordenação e o filtro de
  // confiança — e a divergir dela no primeiro ajuste.
  const [proxima, ultima] = await Promise.all([
    buscarAgregadoNaExtremidade(db, clienteId, agora, "proxima"),
    buscarAgregadoNaExtremidade(db, clienteId, agora, "ultima"),
  ]);

  await db.clienteBackoffice.update({
    where: { id: clienteId },
    data: {
      proximaReuniaoAt: proxima?.startAt ?? null,
      ultimaReuniaoAt: ultima?.startAt ?? null,
      // Sem linha vencedora, os três campos zeram juntos: data, fonte e selo
      // seguem sempre o mesmo registro. Deixar uma fonte órfã de uma data
      // removida faria a tabela exibir procedência de reunião que não existe.
      proximaReuniaoSource: proxima?.source ?? null,
      ultimaReuniaoSource: ultima?.source ?? null,
      proximaReuniaoConfirmadaManualmente: proxima?.matchedVia === "manual",
      ultimaReuniaoConfirmadaManualmente: ultima?.matchedVia === "manual",
    },
  });

  return {
    proxima: proxima?.startAt ?? null,
    ultima: ultima?.startAt ?? null,
  };
}

async function buscarAgregadoNaExtremidade(
  db: ReuniaoExecutor,
  clienteId: string,
  agora: Date,
  lado: "proxima" | "ultima",
) {
  const externalIdSlot = `slot:${lado}`;
  const semSlotsDaOutraColuna = {
    NOT: {
      source: "manual",
      externalId: { in: ["slot:ultima", "slot:proxima"] },
    },
  };
  const slotManual = await db.reuniaoCliente.findFirst({
    where: {
      clienteId,
      userId: null,
      source: "manual",
      externalId: externalIdSlot,
      startAt: lado === "proxima" ? { gte: agora } : { lt: agora },
      ...ROLLUP_CONFIAVEL,
    },
    select: { startAt: true, source: true, matchedVia: true },
  });
  if (slotManual) return escolherAgregadoComSlot(slotManual, null);

  const extrema = await db.reuniaoCliente.findFirst({
    where: {
      clienteId,
      startAt: lado === "proxima" ? { gte: agora } : { lt: agora },
      ...ROLLUP_CONFIAVEL,
      ...semSlotsDaOutraColuna,
    },
    orderBy: { startAt: lado === "proxima" ? "asc" : "desc" },
    select: { startAt: true },
  });
  if (!extrema) return null;

  // A primeira query descobre a data extrema; a segunda traz APENAS os empates
  // daquele timestamp. A prioridade de fonte não pode ser expressa por sort
  // lexicográfico, então a escolha final é explícita e testada em módulo puro.
  const empatadas = await db.reuniaoCliente.findMany({
    where: {
      clienteId,
      startAt: extrema.startAt,
      ...ROLLUP_CONFIAVEL,
      ...semSlotsDaOutraColuna,
    },
    select: { startAt: true, source: true, matchedVia: true },
  });
  return escolherAgregadoComSlot(null, escolherCandidatoAgregado(empatadas));
}

/**
 * Recalcula agregados de muitos clientes em batch — usado no fim de um sync
 * em massa. Evita N+1 fazendo aggregations em batch.
 */
export async function recomputeAgregadosBatch(
  clienteIds: string[],
): Promise<{ atualizados: number }> {
  if (clienteIds.length === 0) return { atualizados: 0 };
  let atualizados = 0;
  for (const id of clienteIds) {
    try {
      await recomputeAgregadosReuniao(id);
      atualizados++;
    } catch {
      // segue — não bloqueia o batch por causa de 1 cliente
    }
  }
  return { atualizados };
}

export { SOURCE_RANK };
