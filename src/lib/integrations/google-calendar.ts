/**
 * Google Calendar API Client
 *
 * Refactor Fase 2 (2026-05): TODO o acesso ao Calendar passa por
 * `getGoogleClientForUser(userId)` (UserGoogleAuth, per-user OAuth).
 * O fluxo legado admin global (GOOGLE_REFRESH_TOKEN) foi removido.
 *
 * Funções de leitura e escrita exigem `userId` como primeiro parâmetro.
 * Quem chama (route handler, cron) é responsável por descobrir o userId
 * correto (session do admin, post.authorId, ou iteração sobre UserGoogleAuth).
 */

import { google, calendar_v3 } from "googleapis";
import {
  getGoogleClientForUser,
  GoogleNotConnectedError,
  recordGoogleAuthError,
} from "./google-user-oauth";

const CALENDAR_ID = "primary";
const TIMEZONE = "America/Bahia";

function getCalendarClient(auth: Awaited<ReturnType<typeof getGoogleClientForUser>>) {
  return google.calendar({ version: "v3", auth });
}

/**
 * Detecta 403 com `insufficient_permission` / "Insufficient Permission" —
 * tipico quando o usuario conectou ANTES da Fase 2 e nao tem o escopo
 * `calendar.events`. Persiste o erro em UserGoogleAuth.lastError pra que
 * a UI mostre "Reconecte sua conta Google".
 */
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

async function noteScopeError(userId: string): Promise<void> {
  try {
    await recordGoogleAuthError(
      userId,
      "Escopo insuficiente — reconecte sua conta Google em /integracoes para autorizar Calendar.",
    );
  } catch {
    /* nao bloqueia */
  }
}

// ============================================
// LISTAGEM DE EVENTOS (pra sync de reuniões com clientes)
// ============================================

/**
 * Versão simplificada do evento para fins de matching cliente x reunião.
 * Os campos `attendees` e `organizer` são as fontes de identidade
 * preferidas (e-mail exato); `summary` é fallback frágil — usar com
 * proteção de sobrenomes comuns.
 */
export interface CalendarEventForMatching {
  id: string;
  summary: string;
  description: string;
  start: Date;
  end: Date | null;
  attendees: string[]; // e-mails normalizados em lowercase
  organizer: string | null; // e-mail normalizado em lowercase
}

async function listEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEventForMatching[]> {
  const auth = await getGoogleClientForUser(userId);
  const calendar = getCalendarClient(auth);

  const events: CalendarEventForMatching[] = [];
  let pageToken: string | undefined;

  do {
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });

    for (const ev of res.data.items ?? []) {
      const startStr = ev.start?.dateTime ?? ev.start?.date;
      if (!startStr) continue;
      const start = new Date(startStr);
      if (isNaN(start.getTime())) continue;
      const endStr = ev.end?.dateTime ?? ev.end?.date;
      const end = endStr ? new Date(endStr) : null;

      events.push({
        id: ev.id || "",
        summary: (ev.summary || "").trim(),
        description: (ev.description || "").trim(),
        start,
        end: end && !isNaN(end.getTime()) ? end : null,
        attendees: (ev.attendees ?? [])
          .map((a) => (a.email || "").toLowerCase().trim())
          .filter((e) => e.length > 0),
        organizer: (ev.organizer?.email || "").toLowerCase().trim() || null,
      });
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

/** Eventos futuros na janela (default 60 dias) — pra `proximaReuniaoAt`. */
export async function listFutureCalendarEvents(
  userId: string,
  daysAhead: number = 60,
): Promise<CalendarEventForMatching[]> {
  const now = new Date();
  const max = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  return listEvents(userId, now, max);
}

/** Eventos passados recentes na janela (default 30 dias) — pra `ultimaReuniaoAt`. */
export async function listRecentCalendarEvents(
  userId: string,
  daysBack: number = 30,
): Promise<CalendarEventForMatching[]> {
  const now = new Date();
  const min = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return listEvents(userId, min, now);
}

// ============================================
// CALENDAR CRUD
// ============================================

export async function createCalendarEvent(
  userId: string,
  event: calendar_v3.Schema$Event,
): Promise<string | null> {
  const auth = await getGoogleClientForUser(userId);
  const calendar = getCalendarClient(auth);

  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: event,
  });

  return res.data.id || null;
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  event: calendar_v3.Schema$Event,
): Promise<void> {
  const auth = await getGoogleClientForUser(userId);
  const calendar = getCalendarClient(auth);

  try {
    await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: event,
    });
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err.code === 404) {
      // Evento não existe mais, ignorar
      return;
    }
    throw error;
  }
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  const auth = await getGoogleClientForUser(userId);
  const calendar = getCalendarClient(auth);

  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId,
    });
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err.code === 404) {
      // Já foi deletado, ok
      return;
    }
    throw error;
  }
}

// ============================================
// HELPERS — Construir eventos a partir de posts
// ============================================

const FORMAT_EMOJI: Record<string, string> = {
  reel: "🎬",
  story: "📱",
  carrossel: "🖼️",
};

const CATEGORY_LABELS: Record<string, string> = {
  pergunta_semana: "Pergunta da Semana",
  onix_pratica: "Onix na Prática",
  patrimonio_mimimi: "Patrimônio sem Mimimi",
  alerta_patrimonial: "Alerta Patrimonial",
  sabado_bastidores: "Sábado de Bastidores",
};

interface PostForCalendar {
  id: string;
  authorId: string;
  title: string;
  format: string;
  category: string;
  status: string;
  scheduledDate: Date | string;
  scheduledTime: string | null;
  ctaType: string | null;
  googleCalendarEventId: string | null;
}

export function buildPostEvent(post: PostForCalendar): calendar_v3.Schema$Event {
  const emoji = FORMAT_EMOJI[post.format] || "📌";
  const categoryLabel = CATEGORY_LABELS[post.category] || post.category;
  const date = new Date(post.scheduledDate);
  const dateStr = date.toISOString().split("T")[0];
  const time = post.scheduledTime || "12:00";

  const startDateTime = `${dateStr}T${time}:00`;
  const endDate = new Date(`${dateStr}T${time}:00`);
  endDate.setMinutes(endDate.getMinutes() + 30);
  const endDateTime = `${endDate.toISOString().split("T")[0]}T${endDate.toTimeString().slice(0, 8)}`;

  return {
    summary: `${emoji} ${post.title}`,
    description: [
      `Post agendado no Ecossistema Onix`,
      ``,
      `Formato: ${post.format}`,
      `Quadro: ${categoryLabel}`,
      post.ctaType ? `CTA: ${post.ctaType}` : null,
      `Status: ${post.status}`,
      ``,
      `🔗 Ecossistema Onix`,
    ].filter(Boolean).join("\n"),
    start: { dateTime: startDateTime, timeZone: TIMEZONE },
    end: { dateTime: endDateTime, timeZone: TIMEZONE },
    colorId: "6", // Tangerine (laranja)
  };
}

// ============================================
// SYNC — Sincronizar post com Google Calendar
// ============================================

/**
 * Sincroniza um post com o Google Calendar do autor do post.
 * - Se o post tem googleCalendarEventId: atualiza o evento
 * - Se não tem: cria um novo evento
 * Retorna o eventId (para salvar no post).
 *
 * Se o autor nao conectou Google ou nao tem escopo calendar.events,
 * retorna null silenciosamente (nao bloqueia create/update do post).
 */
export async function syncPostToCalendar(
  post: PostForCalendar,
): Promise<string | null> {
  try {
    const event = buildPostEvent(post);
    if (post.googleCalendarEventId) {
      await updateCalendarEvent(post.authorId, post.googleCalendarEventId, event);
      return post.googleCalendarEventId;
    }
    return await createCalendarEvent(post.authorId, event);
  } catch (error) {
    if (error instanceof GoogleNotConnectedError) return null;
    if (isInsufficientPermissionError(error)) {
      // Usuario conectou antes da Fase 2 (sem escopo calendar.events).
      // Persiste o erro pra que a UI mostre "Reconecte" em vez de falhar silente.
      await noteScopeError(post.authorId);
      return null;
    }
    console.error("[Google Calendar] Erro ao sincronizar post:", error);
    return post.googleCalendarEventId;
  }
}

/**
 * Remove o evento do Google Calendar associado a um post.
 */
export async function removePostFromCalendar(
  authorId: string,
  googleCalendarEventId: string | null,
): Promise<void> {
  if (!googleCalendarEventId) return;
  try {
    await deleteCalendarEvent(authorId, googleCalendarEventId);
  } catch (error) {
    if (error instanceof GoogleNotConnectedError) return;
    if (isInsufficientPermissionError(error)) {
      await noteScopeError(authorId);
      return;
    }
    console.error("[Google Calendar] Erro ao remover evento:", error);
  }
}

// ============================================
// TESTAR CONEXÃO
// ============================================

export async function testGoogleConnection(
  userId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const auth = await getGoogleClientForUser(userId);
    const calendar = getCalendarClient(auth);
    const res = await calendar.calendarList.get({ calendarId: CALENDAR_ID });
    const name = res.data.summary || "Calendário principal";
    return { success: true, message: `Conectado ao Google Calendar: ${name}` };
  } catch (error) {
    if (error instanceof GoogleNotConnectedError) {
      return { success: false, message: "Conta Google não conectada para este usuário." };
    }
    return { success: false, message: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
