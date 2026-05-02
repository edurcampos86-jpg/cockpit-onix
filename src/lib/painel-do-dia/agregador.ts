import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  AcaoUnificada,
  EmailAcao,
  EmailClassificado,
  EventoAgenda,
  IntegracaoStatus,
  OrigemAcao,
  PainelDoDiaPayload,
  Prioridade,
  QuadrantePM,
  RetrospectivaPayload,
  SugestaoPainelPayload,
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
    if (acao.origem === "local") return true;
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
    resRetros,
    resSugestoes,
    resEmailsAI,
  ] = await Promise.allSettled([
    carregarAcoes(userId),
    carregarPrioridades(userId, data),
    carregarCachesExternos(userId),
    carregarStatusIntegracoes(userId),
    carregarRetrospectivaAtiva(userId),
    carregarSugestoes(userId),
    carregarEmailsClassificados(userId),
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

  const retrospectiva =
    resRetros.status === "fulfilled" ? resRetros.value : undefined;
  const sugestoes: SugestaoPainelPayload[] =
    resSugestoes.status === "fulfilled" ? resSugestoes.value : [];
  const emailsAI = resEmailsAI.status === "fulfilled" ? resEmailsAI.value : new Map();

  // Funde classificacao AI nos emails do cache
  const emails: EmailClassificado[] = caches.emails.map((e) => {
    const ai = emailsAI.get(e.id);
    if (!ai) return e;
    return {
      ...e,
      aiId: ai.id,
      tipo: ai.tipo,
      urgencia: ai.urgencia,
      quadranteSugerido: ai.quadranteSugerido,
      tituloAcao: ai.tituloAcao,
      venceSugerido: ai.venceSugerido,
      clienteVinculadoId: ai.clienteVinculadoId,
      processado: ai.processado,
    };
  });

  return {
    data,
    agenda: dedupe.agenda,
    emails,
    acoes: dedupe.acoes,
    prioridades,
    integracoes,
    errosPorSecao,
    pendingSyncCount: dedupe.acoes.filter((a) => a.pendingSync).length,
    retrospectiva,
    sugestoes,
  };
}

async function carregarRetrospectivaAtiva(
  userId: string
): Promise<RetrospectivaPayload | undefined> {
  const r = await prisma.painelRetrospectiva.findFirst({
    where: { userId, dispensada: false },
    orderBy: { createdAt: "desc" },
  });
  if (!r) return undefined;
  return {
    id: r.id,
    semanaInicio: r.semanaInicio.toISOString(),
    semanaFim: r.semanaFim.toISOString(),
    insight: r.insight,
    metricas: r.metricas as unknown as RetrospectivaPayload["metricas"],
  };
}

async function carregarSugestoes(userId: string): Promise<SugestaoPainelPayload[]> {
  const rows = await prisma.painelSugestao.findMany({
    where: {
      userId,
      status: { in: ["pending", "snoozed"] },
      OR: [
        { status: "pending" },
        { snoozedUntil: { lte: new Date() } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo as SugestaoPainelPayload["tipo"],
    titulo: r.titulo,
    descricao: r.descricao ?? undefined,
    acaoId: r.acaoId ?? undefined,
    clienteId: r.clienteId ?? undefined,
    eventoCalId: r.eventoCalId ?? undefined,
    payload: (r.payload as Record<string, unknown>) ?? {},
    criadaEm: r.createdAt.toISOString(),
  }));
}

async function carregarEmailsClassificados(userId: string): Promise<
  Map<
    string,
    {
      id: string;
      tipo: "acao" | "fyi" | "spam" | "agendamento" | "cliente_novo";
      urgencia: "alta" | "media" | "baixa";
      quadranteSugerido?: QuadrantePM;
      tituloAcao?: string;
      venceSugerido?: string;
      clienteVinculadoId?: string;
      processado: boolean;
    }
  >
> {
  const rows = await prisma.painelEmailAI.findMany({
    where: { userId, arquivado: false },
  });
  const m = new Map();
  for (const r of rows) {
    m.set(r.externoId, {
      id: r.id,
      tipo: r.tipo as "acao" | "fyi" | "spam" | "agendamento" | "cliente_novo",
      urgencia: r.urgencia as "alta" | "media" | "baixa",
      quadranteSugerido: (r.quadranteSugerido ?? undefined) as QuadrantePM | undefined,
      tituloAcao: r.tituloAcao ?? undefined,
      venceSugerido: r.venceSugerido?.toISOString(),
      clienteVinculadoId: r.clienteVinculadoId ?? undefined,
      processado: r.processado,
    });
  }
  return m;
}

async function carregarAcoes(userId: string): Promise<AcaoUnificada[]> {
  const rows = await prisma.acaoPainel.findMany({
    where: { userId },
    orderBy: [{ concluida: "asc" }, { vence: "asc" }, { createdAt: "desc" }],
    include: { clienteVinculado: { select: { id: true, nome: true } } },
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
    resultado: r.resultado ?? undefined,
    tempoGastoMin: r.tempoGastoMin ?? undefined,
    clienteVinculadoId: r.clienteVinculadoId ?? undefined,
    clienteVinculadoNome: r.clienteVinculado?.nome ?? undefined,
    concluidaEm: r.concluidaEm?.toISOString(),
    registradaCrm: r.registradaCrm,
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
    sugeridaPorBoot: r.sugeridaPorBoot,
    bootMotivo: r.bootMotivo ?? undefined,
    tempoEstimadoMin: r.tempoEstimadoMin ?? undefined,
    focusBlockEventId: r.focusBlockEventId ?? undefined,
    focusBlockProvider: (r.focusBlockProvider ?? undefined) as Prioridade["focusBlockProvider"],
    focusBlockStart: r.focusBlockStart?.toISOString(),
    focusBlockEnd: r.focusBlockEnd?.toISOString(),
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

  // Sessao Microsoft considerada expirada se a ultima sync tem mais de 24h
  // (cowork roda quando o Claude Code estoura — se a janela banco fecha, fica stale)
  const msSessaoExpirada =
    !!ultimaMs && Date.now() - ultimaMs.getTime() > 24 * 60 * 60 * 1000;

  // Priority Matrix: status derivado da ultima AcaoPainel sincronizada com origem priority-matrix
  const ultimaPm = await prisma.acaoPainel.findFirst({
    where: { userId, origem: "priority-matrix", externoId: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  // Ordem de exibicao: fontes conectadas primeiro, depois roadmap por prioridade.
  return [
    {
      provider: "microsoft",
      status: ultimaMs ? "conectado" : "desconectado",
      ultimaSincronizacao: ultimaMs?.toISOString(),
      sessaoExpirada: msSessaoExpirada,
      mensagemErro: msSessaoExpirada
        ? "Ultima sincronia ha mais de 24h — banco pode ter deslogado. Reabra o Outlook/To Do no Edge."
        : undefined,
    },
    {
      provider: "priority-matrix",
      status: ultimaPm ? "conectado" : "desconectado",
      ultimaSincronizacao: ultimaPm?.updatedAt.toISOString(),
    },
    {
      provider: "google",
      status: "em-breve",
      roadmapInfo:
        "Google Calendar (pessoal edurcampos86@gmail.com) via OAuth server-side. Plugar quando o token refresh tiver escopo calendar.readonly.",
    },
    {
      provider: "datacrazy",
      status: "em-breve",
      roadmapInfo:
        "Agenda e historico de contatos do CRM Datacrazy via API oficial. Aguardando credencial do banco.",
    },
    {
      provider: "plaud",
      status: "em-breve",
      roadmapInfo:
        "Plaud AI: transcricao de reunioes via webhook Zapier. Infra ja existe em src/lib/plaud.ts — falta plugar na UI do Painel.",
    },
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
