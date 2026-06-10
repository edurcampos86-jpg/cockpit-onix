import "server-only";
import { prisma } from "@/lib/prisma";
import type { EventoAgenda } from "./types";
import { fetchAgendaDoDia } from "./google-fetch";
import {
  createCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/integrations/google-calendar";
import {
  GoogleNotConnectedError,
  recordGoogleAuthError,
} from "@/lib/integrations/google-user-oauth";

/**
 * Sug 2 — Deep Work blocks (ressuscitado da PR #130 com escrita real).
 *
 * Encontra uma janela livre na "golden window" (08:30-11:30 e 14:00-16:30)
 * e agenda um bloco de foco como evento real no Google Calendar do usuário
 * (OAuth per-user, escopo calendar.events). Sem Google conectado ou sem
 * escopo de escrita → FocusBlockError com mensagem acionável; nunca falha
 * silenciosa. O caminho pending-cowork/SyncRequest da versão original foi
 * removido de propósito (Outlook fica para iteração futura).
 */

export class FocusBlockError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "FocusBlockError";
  }
}

const GOOGLE_NAO_CONECTADO_MSG =
  "Google Calendar não conectado. Conecte sua conta Google em Integrações para agendar blocos de foco.";
const GOOGLE_SEM_ESCOPO_MSG =
  "Sua conexão Google não tem permissão de escrita no Calendar. Reconecte sua conta Google em Integrações.";

type GoldenWindow = { startHour: number; startMin: number; endHour: number; endMin: number };

// Janelas ideais de deep work (horário local Bahia)
const GOLDEN_WINDOWS: GoldenWindow[] = [
  { startHour: 8, startMin: 30, endHour: 11, endMin: 30 },
  { startHour: 14, startMin: 0, endHour: 16, endMin: 30 },
];

// Max 3h/dia de foco pra evitar fatigue
const MAX_FOCO_MIN_POR_DIA = 180;

const TIMEZONE = "America/Bahia";

function bahiaIsoToUtc(data: string, hora: number, minuto: number): Date {
  // Bahia = UTC-3, sem horário de verão
  return new Date(
    `${data}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00-03:00`,
  );
}

/**
 * Verifica se [start, end] colide com algum evento existente na agenda.
 */
function temColisao(
  start: Date,
  end: Date,
  eventos: Array<{ inicio: Date; fim: Date }>,
): boolean {
  for (const ev of eventos) {
    // intervalos sobrepõem se max(start) < min(end)
    if (start < ev.fim && end > ev.inicio) return true;
  }
  return false;
}

// Mesma detecção de 403 insufficient_permission de google-calendar.ts
// (lá é module-private): usuário conectou antes da Fase 2, sem calendar.events.
function isInsufficientPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    code?: number;
    message?: string;
    response?: { data?: { error?: { errors?: Array<{ reason?: string }> } } };
  };
  if (e.code === 403) return true;
  const msg = e.message ?? "";
  if (/insufficient[\s_]*permission|insufficient[\s_]*scopes?/i.test(msg)) return true;
  const reasons = e.response?.data?.error?.errors ?? [];
  return reasons.some((r) => /insufficient/i.test(r.reason ?? ""));
}

async function traduzErroGoogle(userId: string, error: unknown): Promise<never> {
  if (error instanceof FocusBlockError) throw error;
  if (error instanceof GoogleNotConnectedError) {
    throw new FocusBlockError(GOOGLE_NAO_CONECTADO_MSG, 409);
  }
  if (isInsufficientPermissionError(error)) {
    // Persiste em UserGoogleAuth.lastError pra UI de /integracoes mostrar "Reconecte"
    await recordGoogleAuthError(userId, GOOGLE_SEM_ESCOPO_MSG).catch(() => void 0);
    throw new FocusBlockError(GOOGLE_SEM_ESCOPO_MSG, 409);
  }
  throw error;
}

/**
 * Encontra próxima janela livre de pelo menos `duracaoMin` dentro das golden
 * windows do dia, sem agendar no passado. Colisão checada contra a agenda
 * Google ao vivo + cache externo do cowork (ms-calendar) + focos já criados.
 * Retorna {start, end} em UTC.
 */
export async function encontrarJanelaLivre(
  userId: string,
  data: string,
  duracaoMin: number,
): Promise<{ start: Date; end: Date } | null> {
  // Agenda Google ao vivo (mesma fonte da rota /agenda). Sem Google
  // conectado, propaga GoogleNotConnectedError — quem trata é o chamador.
  const eventosGoogle = await fetchAgendaDoDia(userId, data);

  // Cache externo do cowork (Outlook via Chrome MCP), se houver
  const cache = await prisma.painelCacheExterno.findFirst({
    where: { userId, source: "ms-calendar" },
  });
  const eventosMs = (cache?.payload as EventoAgenda[] | undefined) ?? [];

  const eventos = [...eventosGoogle, ...eventosMs]
    .filter((e) => e.inicio?.slice(0, 10) === data)
    .map((e) => ({ inicio: new Date(e.inicio), fim: new Date(e.fim) }))
    .filter((e) => !isNaN(e.inicio.getTime()) && !isNaN(e.fim.getTime()));

  // Soma blocos de foco já criados hoje
  const focosHoje = await prisma.painelPrioridade.findMany({
    where: {
      userId,
      data,
      focusBlockEventId: { not: null },
      focusBlockStart: { not: null },
      focusBlockEnd: { not: null },
    },
    select: { tempoEstimadoMin: true, focusBlockStart: true, focusBlockEnd: true },
  });
  const somaFocoAtual = focosHoje.reduce((s, f) => s + (f.tempoEstimadoMin ?? 0), 0);
  if (somaFocoAtual + duracaoMin > MAX_FOCO_MIN_POR_DIA) {
    throw new FocusBlockError(
      `Limite de foco diário (${MAX_FOCO_MIN_POR_DIA}min) seria estourado. Já tem ${somaFocoAtual}min.`,
    );
  }
  focosHoje.forEach((f) => {
    if (f.focusBlockStart && f.focusBlockEnd) {
      eventos.push({ inicio: f.focusBlockStart, fim: f.focusBlockEnd });
    }
  });

  const agora = new Date();

  // Varre as golden windows em passos de 15 min
  for (const gw of GOLDEN_WINDOWS) {
    const inicio = bahiaIsoToUtc(data, gw.startHour, gw.startMin);
    const fim = bahiaIsoToUtc(data, gw.endHour, gw.endMin);
    let candidatoStart = new Date(inicio);
    while (candidatoStart.getTime() + duracaoMin * 60_000 <= fim.getTime()) {
      const candidatoEnd = new Date(candidatoStart.getTime() + duracaoMin * 60_000);
      // não agendar bloco que começa no passado
      if (candidatoStart >= agora && !temColisao(candidatoStart, candidatoEnd, eventos)) {
        return { start: candidatoStart, end: candidatoEnd };
      }
      // avança 15min
      candidatoStart = new Date(candidatoStart.getTime() + 15 * 60_000);
    }
  }

  return null;
}

/**
 * Agenda um focus block como evento real no Google Calendar do usuário
 * e grava os campos focusBlock* na prioridade.
 */
export async function agendarFocusBlock(params: {
  userId: string;
  prioridadeId: string;
  titulo: string;
  duracaoMin: number;
  data: string;
}): Promise<{
  provider: "google";
  eventoId: string;
  start: string;
  end: string;
}> {
  let janela: { start: Date; end: Date } | null;
  try {
    janela = await encontrarJanelaLivre(params.userId, params.data, params.duracaoMin);
  } catch (error) {
    return traduzErroGoogle(params.userId, error);
  }
  if (!janela) {
    throw new FocusBlockError(
      "Sem janela livre nas horas de foco (08:30-11:30 ou 14:00-16:30). Reorganize a agenda ou reduza o tempo estimado.",
    );
  }

  let eventoId: string | null;
  try {
    eventoId = await createCalendarEvent(params.userId, {
      summary: `🎯 Foco: ${params.titulo}`,
      description:
        "Bloco de deep work agendado pelo Painel do Dia (Cockpit Onix). " +
        "Remova pelo painel para manter o estado sincronizado.",
      start: { dateTime: janela.start.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: janela.end.toISOString(), timeZone: TIMEZONE },
      reminders: { useDefault: false },
      transparency: "opaque", // marca como ocupado
    });
  } catch (error) {
    return traduzErroGoogle(params.userId, error);
  }
  if (!eventoId) {
    throw new FocusBlockError("Google Calendar não retornou o id do evento criado.", 502);
  }

  await prisma.painelPrioridade.update({
    where: { id: params.prioridadeId },
    data: {
      focusBlockEventId: eventoId,
      focusBlockProvider: "google",
      focusBlockStart: janela.start,
      focusBlockEnd: janela.end,
    },
  });

  return {
    provider: "google",
    eventoId,
    start: janela.start.toISOString(),
    end: janela.end.toISOString(),
  };
}

/**
 * Remove o bloco de foco: deleta o evento no Google (404 lá dentro é
 * tolerado) e limpa os campos locais. Para registros legados de outros
 * providers (pending-cowork da versão antiga), só limpa o estado local.
 */
export async function removerFocusBlock(params: {
  userId: string;
  prioridadeId: string;
  provider: string | null;
  eventoId: string;
}): Promise<void> {
  if (params.provider === "google") {
    try {
      await deleteCalendarEvent(params.userId, params.eventoId);
    } catch (error) {
      await traduzErroGoogle(params.userId, error);
    }
  }

  await prisma.painelPrioridade.update({
    where: { id: params.prioridadeId },
    data: {
      focusBlockEventId: null,
      focusBlockProvider: null,
      focusBlockStart: null,
      focusBlockEnd: null,
    },
  });
}
