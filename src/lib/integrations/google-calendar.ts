/**
 * Google Calendar API Client
 * Sincroniza posts agendados do Cockpit Onix com o Google Calendar
 */

import { google, calendar_v3 } from "googleapis";
import { getIntegrationConfig, setIntegrationConfig } from "./config";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

const CALENDAR_ID = "primary";
const TIMEZONE = "America/Bahia";

// ============================================
// AUTH — OAuth2
// ============================================

async function getOAuth2Client() {
  const config = await getIntegrationConfig();
  const clientId = config.GOOGLE_CLIENT_ID;
  const clientSecret = config.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar não configurado. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET em Integrações.");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);

  // Se temos refresh token, configurar
  if (config.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });

    // Salvar novo refresh token quando rotacionado
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.refresh_token) {
        await setIntegrationConfig("GOOGLE_REFRESH_TOKEN", tokens.refresh_token);
      }
    });
  }

  return oauth2Client;
}

function getCalendarClient(auth: InstanceType<typeof google.auth.OAuth2>) {
  return google.calendar({ version: "v3", auth });
}

// ============================================
// OAUTH2 AUTHORIZATION CODE FLOW
// ============================================

export function getGoogleAuthUrl(redirectUri: string, clientId: string, clientSecret: string): string {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const config = await getIntegrationConfig();
  const oauth2Client = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  const { tokens } = await oauth2Client.getToken(code);

  if (tokens.refresh_token) {
    await setIntegrationConfig("GOOGLE_REFRESH_TOKEN", tokens.refresh_token);
  }

  return tokens;
}

// ============================================
// CALENDAR CRUD
// ============================================

export async function createCalendarEvent(event: calendar_v3.Schema$Event): Promise<string | null> {
  const auth = await getOAuth2Client();
  const calendar = getCalendarClient(auth);

  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: event,
  });

  return res.data.id || null;
}

export async function updateCalendarEvent(eventId: string, event: calendar_v3.Schema$Event): Promise<void> {
  const auth = await getOAuth2Client();
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

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const auth = await getOAuth2Client();
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
      `Post agendado no Cockpit Onix`,
      ``,
      `Formato: ${post.format}`,
      `Quadro: ${categoryLabel}`,
      post.ctaType ? `CTA: ${post.ctaType}` : null,
      `Status: ${post.status}`,
      ``,
      `🔗 Cockpit Onix`,
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
 * Sincroniza um post com o Google Calendar.
 * - Se o post tem googleCalendarEventId: atualiza o evento
 * - Se não tem: cria um novo evento
 * Retorna o eventId (para salvar no post)
 */
export async function syncPostToCalendar(post: PostForCalendar): Promise<string | null> {
  const config = await getIntegrationConfig();
  if (!config.GOOGLE_REFRESH_TOKEN) return null;

  try {
    const event = buildPostEvent(post);

    if (post.googleCalendarEventId) {
      await updateCalendarEvent(post.googleCalendarEventId, event);
      return post.googleCalendarEventId;
    } else {
      const eventId = await createCalendarEvent(event);
      return eventId;
    }
  } catch (error) {
    console.error("[Google Calendar] Erro ao sincronizar post:", error);
    return post.googleCalendarEventId;
  }
}

/**
 * Remove o evento do Google Calendar associado a um post
 */
export async function removePostFromCalendar(googleCalendarEventId: string | null): Promise<void> {
  if (!googleCalendarEventId) return;

  const config = await getIntegrationConfig();
  if (!config.GOOGLE_REFRESH_TOKEN) return;

  try {
    await deleteCalendarEvent(googleCalendarEventId);
  } catch (error) {
    console.error("[Google Calendar] Erro ao remover evento:", error);
  }
}

// ============================================
// TESTAR CONEXÃO
// ============================================

export async function testGoogleConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const auth = await getOAuth2Client();
    const calendar = getCalendarClient(auth);
    const res = await calendar.calendarList.get({ calendarId: CALENDAR_ID });
    const name = res.data.summary || "Calendário principal";
    return { success: true, message: `Conectado ao Google Calendar: ${name}` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
