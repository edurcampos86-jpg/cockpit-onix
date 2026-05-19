import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Camada unificada de reuniões — fonte da verdade pros agregados
 * `proximaReuniaoAt` / `ultimaReuniaoAt` em ClienteBackoffice.
 *
 * Por que essa camada existe:
 * - As 3 fontes externas (Google Calendar, Outlook ICS, Datacrazy Atividades)
 *   podem registrar a MESMA reunião. Sem chave externa, "última escrita ganha".
 * - `ReuniaoCliente` tem `(source, externalId)` unique → idempotência por
 *   fonte. Mesma reunião replicada em 2 fontes vira 2 linhas com `startAt`
 *   igual; o agregado deduplica via MIN/MAX no SQL.
 *
 * Ordem das fontes ao haver conflito de dados (ex: título diferente):
 *   google-cal > outlook-ics > datacrazy-atividade > manual
 * (definido em SOURCE_RANK abaixo, usado só pra desempate na escolha do
 * "título canônico" — os agregados de data não dependem dessa ordem).
 */

export type ReuniaoSource =
  | "google-cal"
  | "outlook-ics"
  | "datacrazy-atividade"
  | "manual";

export type ReuniaoMatchedVia =
  | "email"
  | "telefone"
  | "nome-unico"
  | "nome-substring"
  | "manual";

const SOURCE_RANK: Record<ReuniaoSource, number> = {
  "google-cal": 4,
  "outlook-ics": 3,
  "datacrazy-atividade": 2,
  manual: 1,
};

export const MATCH_SCORE: Record<ReuniaoMatchedVia, number> = {
  email: 100,
  telefone: 80,
  "nome-unico": 50,
  "nome-substring": 30,
  manual: 0,
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
): Promise<"created" | "updated" | "noop"> {
  const realizada = input.startAt < new Date();
  const matchScore = MATCH_SCORE[input.matchedVia];
  const userId = input.userId ?? null;

  // findUnique nao serve aqui: o Prisma rejeita `userId: null` no compound
  // unique (NULL nao satisfaz @unique no contrato JS). findFirst escopa
  // corretamente o "tipo global" via where literal.
  const existente = await prisma.reuniaoCliente.findFirst({
    where: { userId, source: input.source, externalId: input.externalId },
  });

  if (!existente) {
    await prisma.reuniaoCliente.create({
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

  // Se nada relevante mudou, no-op (evita updatedAt churn no índice)
  const naoMudou =
    existente.startAt.getTime() === input.startAt.getTime() &&
    (existente.endAt?.getTime() ?? null) === (input.endAt?.getTime() ?? null) &&
    existente.titulo === (input.titulo ?? null) &&
    existente.realizada === realizada &&
    existente.clienteId === input.clienteId;
  if (naoMudou) return "noop";

  await prisma.reuniaoCliente.update({
    where: { id: existente.id },
    data: {
      clienteId: input.clienteId,
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
 * Retorna true se algo foi deletado. Caller decide se recalcula agregados.
 */
export async function deleteReuniaoByExternal(
  source: ReuniaoSource,
  externalId: string,
  userId: string | null = null,
): Promise<boolean> {
  const r = await prisma.reuniaoCliente.deleteMany({
    where: { source, externalId, userId },
  });
  return r.count > 0;
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
): Promise<{ proxima: Date | null; ultima: Date | null }> {
  const agora = new Date();

  const [proxima, ultima] = await Promise.all([
    prisma.reuniaoCliente.findFirst({
      where: { clienteId, startAt: { gte: agora } },
      orderBy: { startAt: "asc" },
      select: { startAt: true },
    }),
    prisma.reuniaoCliente.findFirst({
      where: { clienteId, startAt: { lt: agora } },
      orderBy: { startAt: "desc" },
      select: { startAt: true },
    }),
  ]);

  await prisma.clienteBackoffice.update({
    where: { id: clienteId },
    data: {
      proximaReuniaoAt: proxima?.startAt ?? null,
      ultimaReuniaoAt: ultima?.startAt ?? null,
    },
  });

  return {
    proxima: proxima?.startAt ?? null,
    ultima: ultima?.startAt ?? null,
  };
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
