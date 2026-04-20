import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  AcaoUnificada,
  EmailAcao,
  EventoAgenda,
  IntegracaoStatus,
  PainelDoDiaPayload,
  Prioridade,
} from "./types";

/**
 * Carrega o payload consolidado do Painel do Dia para um usuario e uma data.
 *
 * Usa Promise.allSettled para nao derrubar a pagina inteira se uma fonte falhar.
 * Cada secao reporta erro individual em errosPorSecao.
 */
export async function carregarPainelDoDia(
  userId: string,
  data: string // "YYYY-MM-DD"
): Promise<PainelDoDiaPayload> {
  const [
    resAcoes,
    resPrioridades,
    resCaches,
    resIntegracoes,
  ] = await Promise.allSettled([
    carregarAcoes(userId),
    carregarPrioridades(userId, data),
    carregarCachesExternos(userId),
    carregarStatusIntegracoes(userId),
  ]);

  const errosPorSecao: PainelDoDiaPayload["errosPorSecao"] = {};

  const acoes: AcaoUnificada[] =
    resAcoes.status === "fulfilled" ? resAcoes.value : [];
  if (resAcoes.status === "rejected") {
    errosPorSecao.acoes = String(resAcoes.reason);
  }

  const prioridades: Prioridade[] =
    resPrioridades.status === "fulfilled" ? resPrioridades.value : [];

  const caches =
    resCaches.status === "fulfilled" ? resCaches.value : { agenda: [], emails: [] };
  if (resCaches.status === "rejected") {
    errosPorSecao.agenda = String(resCaches.reason);
    errosPorSecao.emails = String(resCaches.reason);
  }

  const integracoes: IntegracaoStatus[] =
    resIntegracoes.status === "fulfilled" ? resIntegracoes.value : [];

  return {
    data,
    agenda: caches.agenda,
    emails: caches.emails,
    acoes,
    prioridades,
    integracoes,
    errosPorSecao,
    pendingSyncCount: acoes.filter((a) => a.pendingSync).length,
  };
}

async function carregarAcoes(userId: string): Promise<AcaoUnificada[]> {
  const rows = await prisma.acaoPainel.findMany({
    where: { userId },
    orderBy: [{ concluida: "asc" }, { vence: "asc" }, { createdAt: "desc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    origem: r.origem as AcaoUnificada["origem"],
    titulo: r.titulo,
    concluida: r.concluida,
    vence: r.vence?.toISOString(),
    importante: r.importante,
    noMeuDia: r.noMeuDia,
    quadrante: (r.quadrante ?? undefined) as AcaoUnificada["quadrante"],
    projetoPm: r.projetoPm ?? undefined,
    externoId: r.externoId ?? undefined,
    pendingSync: r.pendingSync,
    syncOp: (r.syncOp ?? undefined) as AcaoUnificada["syncOp"],
    syncError: r.syncError ?? undefined,
  }));
}

async function carregarPrioridades(
  userId: string,
  data: string
): Promise<Prioridade[]> {
  const rows = await prisma.painelPrioridade.findMany({
    where: { userId, data },
    orderBy: { posicao: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    posicao: r.posicao as 1 | 2 | 3,
    texto: r.texto,
    concluida: r.concluida,
  }));
}

async function carregarCachesExternos(userId: string): Promise<{
  agenda: EventoAgenda[];
  emails: EmailAcao[];
}> {
  const caches = await prisma.painelCacheExterno.findMany({
    where: { userId, source: { in: ["ms-calendar", "ms-mail"] } },
  });

  const agendaCache = caches.find((c) => c.source === "ms-calendar");
  const mailCache = caches.find((c) => c.source === "ms-mail");

  return {
    agenda: (agendaCache?.payload as EventoAgenda[] | undefined) ?? [],
    emails: (mailCache?.payload as EmailAcao[] | undefined) ?? [],
  };
}

async function carregarStatusIntegracoes(
  userId: string
): Promise<IntegracaoStatus[]> {
  // Microsoft via cowork: status derivado dos caches
  const caches = await prisma.painelCacheExterno.findMany({
    where: { userId, source: { in: ["ms-calendar", "ms-mail"] } },
    select: { source: true, syncedAt: true },
  });

  const calCache = caches.find((c) => c.source === "ms-calendar");
  const mailCache = caches.find((c) => c.source === "ms-mail");
  const ultimaMs =
    calCache && mailCache
      ? (calCache.syncedAt < mailCache.syncedAt
          ? calCache.syncedAt
          : mailCache.syncedAt)
      : calCache?.syncedAt ?? mailCache?.syncedAt;

  // Priority Matrix: status derivado da ultima AcaoPainel sincronizada com origem priority-matrix
  const ultimaPm = await prisma.acaoPainel.findFirst({
    where: { userId, origem: "priority-matrix", externoId: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  return [
    {
      provider: "google",
      status: "em-breve", // TODO: derivar do config.GOOGLE_REFRESH_TOKEN quando escopo gmail estiver plugado
    },
    {
      provider: "microsoft",
      status: ultimaMs ? "conectado" : "desconectado",
      ultimaSincronizacao: ultimaMs?.toISOString(),
    },
    {
      provider: "priority-matrix",
      status: ultimaPm ? "conectado" : "desconectado",
      ultimaSincronizacao: ultimaPm?.updatedAt.toISOString(),
    },
    { provider: "plaud", status: "em-breve" },
    { provider: "datacrazy", status: "em-breve" },
  ];
}

/**
 * Data de hoje em America/Bahia no formato "YYYY-MM-DD".
 */
export function hojeBahia(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}
