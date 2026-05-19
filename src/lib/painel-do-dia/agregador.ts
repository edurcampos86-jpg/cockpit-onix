import "server-only";
import { prisma } from "@/lib/prisma";
import { fetchAgendaDoDia, fetchEmailsAcao } from "./google-fetch";
import { GoogleNotConnectedError } from "@/lib/integrations/google-user-oauth";
import { processarTriagemEmails } from "./triar-emails";
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
    resGoogleAuth,
    resGoogleAgenda,
    resGoogleEmails,
    resRetros,
    resSugestoes,
  ] = await Promise.allSettled([
    carregarAcoes(userId),
    carregarPrioridades(userId, data),
    carregarCachesExternos(userId),
    carregarGoogleAuth(userId),
    carregarAgendaGoogle(userId, data),
    carregarEmailsGoogle(userId),
    carregarRetrospectivaAtiva(userId),
    carregarSugestoes(userId),
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

  const googleAuth =
    resGoogleAuth.status === "fulfilled" ? resGoogleAuth.value : null;

  const googleAgenda: EventoAgenda[] =
    resGoogleAgenda.status === "fulfilled" ? resGoogleAgenda.value : [];
  let agendaFetchedAt: string | undefined;
  if (resGoogleAgenda.status === "fulfilled") {
    agendaFetchedAt = new Date().toISOString();
  } else if (googleAuth) {
    // só reporta erro se o usuário está conectado — desconectado é estado normal
    errosPorSecao.agenda = errosPorSecao.agenda
      ? errosPorSecao.agenda
      : String(resGoogleAgenda.reason);
  }

  const googleEmails: EmailAcao[] =
    resGoogleEmails.status === "fulfilled" ? resGoogleEmails.value : [];
  let emailsFetchedAt: string | undefined;
  if (resGoogleEmails.status === "fulfilled") {
    emailsFetchedAt = new Date().toISOString();
  } else if (googleAuth) {
    errosPorSecao.emails = errosPorSecao.emails
      ? errosPorSecao.emails
      : String(resGoogleEmails.reason);
  }

  // Triagem AI dos e-mails Gmail recém-buscados (dedupe interno por
  // PainelEmailAI.externoId — só novos vão pro Claude). Best-effort:
  // se Claude estiver fora, segue com e-mails sem classificacao.
  if (googleEmails.length > 0) {
    try {
      await processarTriagemEmails(userId, googleEmails);
    } catch (err) {
      console.error("[agregador] triagem gmail falhou", err);
    }
  }

  // Carrega TODAS as classificacoes do usuario (uma query so) e particiona
  // entre ativas e arquivadas em memoria. Evita duas roundtrips ao banco.
  let emailsAI: Map<string, EmailAIRecord>;
  let arquivados: Set<string>;
  try {
    const { ativos, arquivados: arq } = await carregarTodosEmailsAI(userId);
    emailsAI = ativos;
    arquivados = arq;
  } catch {
    emailsAI = new Map();
    arquivados = new Set();
  }

  // Une agenda do cache Microsoft + Google (a dedupe visual fica em AgendaUnificada)
  const agendaUnida: EventoAgenda[] = [...caches.agenda, ...googleAgenda];
  const dedupe = deduplicarAcoesVsAgenda(acoes, agendaUnida);

  const integracoes = montarStatusIntegracoes({
    msCalendar: caches.agenda.length > 0 ? caches.metaMs?.calSyncedAt : undefined,
    msMail: caches.emails.length > 0 ? caches.metaMs?.mailSyncedAt : undefined,
    msSessaoExpirada: caches.metaMs?.expirada ?? false,
    msMensagemErro: caches.metaMs?.mensagemErro,
    pmUltima: await ultimaSyncPriorityMatrix(userId),
    googleAuth,
    googleAgendaFetchedAt: agendaFetchedAt,
    googleEmailsFetchedAt: emailsFetchedAt,
    googleAgendaError:
      resGoogleAgenda.status === "rejected" ? String(resGoogleAgenda.reason) : undefined,
    googleEmailsError:
      resGoogleEmails.status === "rejected" ? String(resGoogleEmails.reason) : undefined,
  });

  const retrospectiva =
    resRetros.status === "fulfilled" ? resRetros.value : undefined;
  const sugestoes: SugestaoPainelPayload[] =
    resSugestoes.status === "fulfilled" ? resSugestoes.value : [];

  // Mescla classificação AI nos emails de ambas as origens (ms-mail e gmail).
  function enriquecer(e: EmailAcao): EmailClassificado {
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
  }
  // Arquivados sao filtrados aqui (emails sem entrada na AI seguem visiveis).
  const emailsMs: EmailClassificado[] = caches.emails
    .filter((e) => !arquivados.has(e.id))
    .map(enriquecer);
  const emailsGmail: EmailClassificado[] = googleEmails
    .filter((e) => !arquivados.has(e.id))
    .map(enriquecer);
  const emails: EmailClassificado[] = [...emailsMs, ...emailsGmail];

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
    googleConectado: !!googleAuth,
    googleEmail: googleAuth?.googleEmail,
    agendaFetchedAt,
    emailsFetchedAt,
  };
}

async function carregarGoogleAuth(userId: string) {
  return prisma.userGoogleAuth.findUnique({
    where: { userId },
    select: {
      googleEmail: true,
      lastError: true,
      lastErrorAt: true,
      lastUsedAt: true,
    },
  });
}

async function carregarAgendaGoogle(
  userId: string,
  data: string,
): Promise<EventoAgenda[]> {
  try {
    return await fetchAgendaDoDia(userId, data);
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return [];
    throw err;
  }
}

async function carregarEmailsGoogle(userId: string): Promise<EmailAcao[]> {
  try {
    return await fetchEmailsAcao(userId, 10);
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return [];
    throw err;
  }
}

async function ultimaSyncPriorityMatrix(userId: string): Promise<Date | undefined> {
  const ultimaPm = await prisma.acaoPainel.findFirst({
    where: { userId, origem: "priority-matrix", externoId: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  return ultimaPm?.updatedAt;
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

type EmailAIRecord = {
  id: string;
  tipo: "acao" | "fyi" | "spam" | "agendamento" | "cliente_novo";
  urgencia: "alta" | "media" | "baixa";
  quadranteSugerido?: QuadrantePM;
  tituloAcao?: string;
  venceSugerido?: string;
  clienteVinculadoId?: string;
  processado: boolean;
};

/**
 * Carrega TODOS os PainelEmailAI do usuario numa query so e particiona em
 * (ativos -> Map por externoId) + (arquivados -> Set de externoId).
 */
async function carregarTodosEmailsAI(userId: string): Promise<{
  ativos: Map<string, EmailAIRecord>;
  arquivados: Set<string>;
}> {
  const rows = await prisma.painelEmailAI.findMany({
    where: { userId },
  });
  const ativos = new Map<string, EmailAIRecord>();
  const arquivados = new Set<string>();
  for (const r of rows) {
    if (r.arquivado) {
      arquivados.add(r.externoId);
      continue;
    }
    ativos.set(r.externoId, {
      id: r.id,
      tipo: r.tipo as EmailAIRecord["tipo"],
      urgencia: r.urgencia as EmailAIRecord["urgencia"],
      quadranteSugerido: (r.quadranteSugerido ?? undefined) as QuadrantePM | undefined,
      tituloAcao: r.tituloAcao ?? undefined,
      venceSugerido: r.venceSugerido?.toISOString(),
      clienteVinculadoId: r.clienteVinculadoId ?? undefined,
      processado: r.processado,
    });
  }
  return { ativos, arquivados };
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

type CachesMs = {
  agenda: EventoAgenda[];
  emails: EmailAcao[];
  metaMs?: {
    calSyncedAt?: Date;
    mailSyncedAt?: Date;
    expirada: boolean;
    mensagemErro?: string;
  };
};

async function carregarCachesExternos(userId: string): Promise<CachesMs> {
  const caches = await prisma.painelCacheExterno.findMany({
    where: { userId, source: { in: ["ms-calendar", "ms-mail"] } },
  });

  const agendaCache = caches.find((c) => c.source === "ms-calendar");
  const mailCache = caches.find((c) => c.source === "ms-mail");

  const calSyncedAt = agendaCache?.syncedAt;
  const mailSyncedAt = mailCache?.syncedAt;
  const ultimaMs =
    calSyncedAt && mailSyncedAt
      ? calSyncedAt < mailSyncedAt
        ? calSyncedAt
        : mailSyncedAt
      : calSyncedAt ?? mailSyncedAt;
  const expirada = !!ultimaMs && Date.now() - ultimaMs.getTime() > 24 * 60 * 60 * 1000;

  return {
    agenda: (agendaCache?.payload as EventoAgenda[] | undefined) ?? [],
    emails: (mailCache?.payload as EmailAcao[] | undefined) ?? [],
    metaMs: {
      calSyncedAt,
      mailSyncedAt,
      expirada,
      mensagemErro: expirada
        ? "Ultima sincronia ha mais de 24h — banco pode ter deslogado. Reabra o Outlook/To Do no Edge."
        : undefined,
    },
  };
}

function montarStatusIntegracoes(input: {
  msCalendar?: Date;
  msMail?: Date;
  msSessaoExpirada: boolean;
  msMensagemErro?: string;
  pmUltima?: Date;
  googleAuth: {
    googleEmail: string;
    lastError: string | null;
    lastErrorAt: Date | null;
    lastUsedAt: Date | null;
  } | null;
  googleAgendaFetchedAt?: string;
  googleEmailsFetchedAt?: string;
  googleAgendaError?: string;
  googleEmailsError?: string;
}): IntegracaoStatus[] {
  const {
    msCalendar,
    msMail,
    msSessaoExpirada,
    msMensagemErro,
    pmUltima,
    googleAuth,
    googleAgendaFetchedAt,
    googleEmailsFetchedAt,
    googleAgendaError,
    googleEmailsError,
  } = input;

  const ultimaMs =
    msCalendar && msMail
      ? msCalendar < msMail
        ? msCalendar
        : msMail
      : msCalendar ?? msMail;

  let googleStatus: IntegracaoStatus["status"] = "desconectado";
  let googleUltima: string | undefined;
  let googleErro: string | undefined;
  if (googleAuth) {
    const algumErro = googleAgendaError ?? googleEmailsError ?? googleAuth.lastError ?? null;
    googleStatus = algumErro ? "erro" : "conectado";
    googleUltima =
      googleAgendaFetchedAt ??
      googleEmailsFetchedAt ??
      googleAuth.lastUsedAt?.toISOString();
    if (algumErro) {
      googleErro = /invalid_grant/i.test(algumErro)
        ? "Sessão Google expirada — reconecte em Integrações."
        : algumErro;
    }
  }

  return [
    {
      provider: "microsoft",
      status: ultimaMs ? "conectado" : "desconectado",
      ultimaSincronizacao: ultimaMs?.toISOString(),
      sessaoExpirada: msSessaoExpirada,
      mensagemErro: msSessaoExpirada ? msMensagemErro : undefined,
    },
    {
      provider: "google",
      status: googleStatus,
      ultimaSincronizacao: googleUltima,
      mensagemErro: googleErro,
    },
    {
      provider: "priority-matrix",
      status: pmUltima ? "conectado" : "desconectado",
      ultimaSincronizacao: pmUltima?.toISOString(),
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
