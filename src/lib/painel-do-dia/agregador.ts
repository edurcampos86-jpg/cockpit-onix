import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  AcaoUnificada,
  EmailAcao,
  EventoAgenda,
  IntegracaoStatus,
  OrigemAcao,
  PainelDoDiaPayload,
  Prioridade,
} from "./types";

/**
 * Normaliza um titulo para comparacao fuzzy entre agenda e acoes.
 * Remove prefixo de horario "HH:MM ", sufixo "(HH:MM)", acentua, caixa e espacos duplicados.
 */
export function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^\d{1,2}:\d{2}\s+/, "")
    .replace(/\s*\(\d{1,2}:\d{2}\)\s*$/, "")
    .replace(/\s+/g, " ");
}

/**
 * Remove das acoes itens que sao espelhos de eventos da agenda
 * (caso tipico: Priority Matrix sincronizado com Outlook duplicando compromissos).
 * Eventos que receberam espelho ganham `fontesExtras` com a origem duplicada,
 * permitindo a UI mostrar badge combinada tipo "Outlook + Priority Matrix".
 */
export function deduplicarAcoesVsAgenda(
  acoes: AcaoUnificada[],
  agenda: EventoAgenda[]
): { acoes: AcaoUnificada[]; agenda: EventoAgenda[] } {
  if (agenda.length === 0) return { acoes, agenda };

  const indice = new Map<string, EventoAgenda>();
  for (const ev of agenda) {
    const chave = normalizarTitulo(ev.titulo);
    if (chave.length >= 3) indice.set(chave, ev);
  }

  const fontesExtras = new Map<string, Set<OrigemAcao>>();
  const acoesFiltradas = acoes.filter((acao) => {
    if (acao.origem === "cockpit") return true;
    const match = indice.get(normalizarTitulo(acao.titulo));
    if (!match) return true;
    const set = fontesExtras.get(match.id) ?? new Set<OrigemAcao>();
    set.add(acao.origem);
    fontesExtras.set(match.id, set);
    return false;
  });

  const agendaEnriquecida = agenda.map((ev) => {
    const extras = fontesExtras.get(ev.id);
    return extras && extras.size > 0
      ? { ...ev, fontesExtras: Array.from(extras) }
      : ev;
  });

  return { acoes: acoesFiltradas, agenda: agendaEnriquecida };
}

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

  const dedupe = deduplicarAcoesVsAgenda(acoes, caches.agenda);

  return {
    data,
    agenda: dedupe.agenda,
    emails: caches.emails,
    acoes: dedupe.acoes,
    prioridades,
    integracoes,
    errosPorSecao,
    pendingSyncCount: dedupe.acoes.filter((a) => a.pendingSync).length,
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
