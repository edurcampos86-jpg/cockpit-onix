import "server-only";
import {
  getMicrosoftAccessTokenForUser,
  MicrosoftNotConnectedError,
  isMicrosoftInvalidGrantError,
  isMicrosoftInsufficientPermissionError,
  recordMicrosoftAuthError,
  touchMicrosoftAuthUsage,
} from "@/lib/integrations/microsoft-user-oauth";
import type { EmailAcao, EventoAgenda } from "./types";

/**
 * Microsoft Graph fetch para o Painel do Dia — espelha google-fetch.ts.
 *
 * Faz chamadas REST contra graph.microsoft.com/v1.0/me. Conviveria com o
 * cowork-sync legado: o agregador prefere Graph quando UserMicrosoftAuth
 * existe, senao cai pro cache cowork em PainelCacheExterno.
 */

const MS_GRAPH = "https://graph.microsoft.com/v1.0";
const TIMEZONE = "America/Bahia";

function janelaDoDiaBahia(dataYmd: string): {
  startISO: string;
  endISO: string;
} {
  const [y, m, d] = dataYmd.split("-").map(Number);
  // Bahia = UTC-3 (sem DST). 00:00 Bahia == 03:00 UTC.
  const startISO = new Date(Date.UTC(y, m - 1, d, 3, 0, 0)).toISOString();
  const endISO = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0)).toISOString();
  return { startISO, endISO };
}

function extractMeetingLink(
  body: string | undefined,
  onlineMeetingUrl: string | undefined,
): string | undefined {
  if (onlineMeetingUrl) return onlineMeetingUrl;
  if (!body) return undefined;
  const m = body.match(
    /https?:\/\/[^\s<>"]+(meet\.google\.com|zoom\.us|teams\.microsoft\.com)[^\s<>"]*/i,
  );
  return m?.[0];
}

async function callGraph<T>(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getMicrosoftAccessTokenForUser(userId);
  const res = await fetch(`${MS_GRAPH}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      // Forca timezones nos retornos a vir convertidos pra Bahia.
      Prefer: `outlook.timezone="${TIMEZONE}"`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Graph ${res.status} ${path}: ${text.slice(0, 200)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

interface MsEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  location?: { displayName?: string };
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  onlineMeeting?: { joinUrl?: string };
  webLink?: string;
  organizer?: { emailAddress?: { name?: string; address?: string } };
  isAllDay?: boolean;
}

export async function fetchAgendaDoDiaMs(
  userId: string,
  dataYmd: string,
): Promise<EventoAgenda[]> {
  const { startISO, endISO } = janelaDoDiaBahia(dataYmd);
  // calendarView expande recorrências; melhor que /events pra view de dia.
  const path = `/me/calendarView?startDateTime=${encodeURIComponent(
    startISO,
  )}&endDateTime=${encodeURIComponent(
    endISO,
  )}&$select=id,subject,start,end,location,bodyPreview,body,onlineMeeting,webLink,organizer,isAllDay&$top=50&$orderby=start/dateTime`;

  let data: { value?: MsEvent[] };
  try {
    data = await callGraph<{ value?: MsEvent[] }>(userId, path);
    await touchMicrosoftAuthUsage(userId);
  } catch (err) {
    if (err instanceof MicrosoftNotConnectedError) throw err;
    if (isMicrosoftInvalidGrantError(err)) {
      await recordMicrosoftAuthError(userId, "invalid_grant — sessão expirada");
    } else if (isMicrosoftInsufficientPermissionError(err)) {
      await recordMicrosoftAuthError(
        userId,
        "Escopo insuficiente — reconecte sua conta Microsoft para autorizar Calendar.",
      );
    }
    throw err;
  }

  const items = data.value ?? [];
  return items.map((ev): EventoAgenda => {
    const startStr = ev.start?.dateTime;
    const endStr = ev.end?.dateTime;
    const inicio = startStr
      ? new Date(startStr).toISOString()
      : new Date().toISOString();
    return {
      id: ev.id,
      titulo: ev.subject ?? "(sem título)",
      inicio,
      fim: endStr ? new Date(endStr).toISOString() : inicio,
      organizador: ev.organizer?.emailAddress?.name ?? undefined,
      origem: "ms-calendar",
      linkReuniao: extractMeetingLink(
        ev.body?.content,
        ev.onlineMeeting?.joinUrl,
      ),
    };
  });
}

interface MsMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  webLink?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  isRead?: boolean;
}

const PALAVRAS_ACAO = [
  "preciso",
  "urgente",
  "favor",
  "quando",
  "aguardo",
  "retorno",
  "pedido",
  "solicito",
  "confirma",
  "agendar",
];

function ehAcao(msg: MsMessage, meuEmail: string | null): boolean {
  const subject = (msg.subject ?? "").toLowerCase();
  const preview = (msg.bodyPreview ?? "").toLowerCase();
  if (subject.includes("?")) return true;
  if (
    meuEmail &&
    (msg.toRecipients ?? []).some(
      (t) => t.emailAddress?.address?.toLowerCase() === meuEmail.toLowerCase(),
    )
  ) {
    return true;
  }
  return PALAVRAS_ACAO.some((p) => subject.includes(p) || preview.includes(p));
}

export async function fetchEmailsAcaoMs(
  userId: string,
  limit = 10,
): Promise<EmailAcao[]> {
  // Janela: últimas 24h, não lidos, ordenados por data.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const filter = `isRead eq false and receivedDateTime ge ${since}`;
  const path = `/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(
    filter,
  )}&$select=id,subject,bodyPreview,receivedDateTime,webLink,from,toRecipients,isRead&$top=50&$orderby=receivedDateTime desc`;

  // Para a heurística de "destinatário direto = você", buscar o e-mail do
  // usuário (do cache do oauth, evita uma roundtrip no Graph /me a cada call).
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.userMicrosoftAuth.findUnique({
    where: { userId },
    select: { microsoftEmail: true },
  });
  const meuEmail = row?.microsoftEmail ?? null;

  let data: { value?: MsMessage[] };
  try {
    data = await callGraph<{ value?: MsMessage[] }>(userId, path);
    await touchMicrosoftAuthUsage(userId);
  } catch (err) {
    if (err instanceof MicrosoftNotConnectedError) throw err;
    if (isMicrosoftInvalidGrantError(err)) {
      await recordMicrosoftAuthError(userId, "invalid_grant — sessão expirada");
    } else if (isMicrosoftInsufficientPermissionError(err)) {
      await recordMicrosoftAuthError(
        userId,
        "Escopo insuficiente — reconecte sua conta Microsoft para autorizar Mail.",
      );
    }
    throw err;
  }

  const itens = data.value ?? [];
  return itens
    .filter((m) => ehAcao(m, meuEmail))
    .slice(0, limit)
    .map((m): EmailAcao => ({
      id: m.id,
      origem: "ms-mail",
      remetente:
        m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "?",
      assunto: m.subject ?? "(sem assunto)",
      snippet: m.bodyPreview ?? "",
      link: m.webLink ?? "",
      recebidoEm: m.receivedDateTime ?? new Date().toISOString(),
    }));
}
