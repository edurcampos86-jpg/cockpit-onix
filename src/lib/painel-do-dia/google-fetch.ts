import "server-only";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import {
  getGoogleClientForUser,
  GoogleNotConnectedError,
  isInvalidGrantError,
  recordGoogleAuthError,
  touchGoogleAuthUsage,
} from "@/lib/integrations/google-user-oauth";
import { prisma } from "@/lib/prisma";
import type { EmailAcao, EventoAgenda } from "./types";

const TIMEZONE = "America/Bahia";

/**
 * Converte "YYYY-MM-DD" (em America/Bahia) para janela ISO [00:00, 24:00)
 * usada no timeMin/timeMax do Calendar.
 *
 * Bahia é UTC-3 fixo (sem DST). Construímos as datas como UTC-3 explícito
 * para evitar surpresa de TZ do servidor.
 */
function janelaDoDiaBahia(dataYmd: string): { timeMin: Date; timeMax: Date } {
  const [y, m, d] = dataYmd.split("-").map(Number);
  // 00:00 em America/Bahia (UTC-3) == 03:00 UTC do mesmo dia
  const timeMin = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const timeMax = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
  return { timeMin, timeMax };
}

function extractMeetingLink(
  description: string | null | undefined,
  hangoutLink: string | null | undefined,
): string | undefined {
  if (hangoutLink) return hangoutLink;
  if (!description) return undefined;
  const m = description.match(
    /https?:\/\/[^\s<>"]+(meet\.google\.com|zoom\.us|teams\.microsoft\.com)[^\s<>"]*/i,
  );
  return m?.[0];
}

export async function fetchAgendaDoDia(
  userId: string,
  dataYmd: string,
): Promise<EventoAgenda[]> {
  const client = await getGoogleClientForUser(userId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const { timeMin, timeMax } = janelaDoDiaBahia(dataYmd);

  try {
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
      timeZone: TIMEZONE,
    });

    await touchGoogleAuthUsage(userId);

    const eventos: EventoAgenda[] = [];
    for (const ev of res.data.items ?? []) {
      const startStr =
        ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00-03:00` : null);
      const endStr =
        ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T00:00:00-03:00` : null);
      if (!startStr || !endStr) continue;
      const inicio = new Date(startStr);
      const fim = new Date(endStr);
      if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) continue;
      const self = (ev.attendees ?? []).find((a) => a.self);
      if (self?.responseStatus === "declined") continue;

      eventos.push({
        id: ev.id ?? `${inicio.toISOString()}-${ev.summary ?? "sem-titulo"}`,
        origem: "google",
        titulo: (ev.summary ?? "(sem título)").trim(),
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        linkReuniao: extractMeetingLink(ev.description, ev.hangoutLink),
        organizador: ev.organizer?.email ?? undefined,
      });
    }

    return eventos;
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await recordGoogleAuthError(userId, "invalid_grant — usuário precisa reconectar");
    }
    throw err;
  }
}

// ============================================
// Gmail
// ============================================

const PALAVRAS_ACAO = [
  "preciso",
  "urgente",
  "favor",
  "quando",
  "aguardo",
  "por gentileza",
  "pode",
  "consegue",
  "prazo",
  "retorno",
  "responder",
  "confirme",
  "confirmar",
];

const ACAO_REGEX = new RegExp(`\\b(${PALAVRAS_ACAO.join("|")})\\b`, "i");
const DIACRITICOS = /[̀-ͯ]/g;

function normalizar(s: string): string {
  return s.normalize("NFD").replace(DIACRITICOS, "").toLowerCase();
}

function parseEmailFromHeader(headerValue: string): string {
  const m = headerValue.match(/<([^>]+)>/);
  return (m?.[1] ?? headerValue).trim().toLowerCase();
}

function headersToMap(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name && h.value) out[h.name.toLowerCase()] = h.value;
  }
  return out;
}

function pedeAcao(opts: {
  assunto: string;
  snippet: string;
  to: string;
  meuEmail: string;
}): boolean {
  const { assunto, snippet, to, meuEmail } = opts;
  if (assunto.includes("?")) return true;
  if (meuEmail) {
    const meu = meuEmail.toLowerCase();
    const tos = to.split(",").map((t) => parseEmailFromHeader(t));
    if (tos.includes(meu)) return true;
  }
  const corpus = normalizar(`${assunto} ${snippet}`);
  return ACAO_REGEX.test(corpus);
}

export async function fetchEmailsAcao(
  userId: string,
  limit = 10,
): Promise<EmailAcao[]> {
  const client = await getGoogleClientForUser(userId);
  const gmail = google.gmail({ version: "v1", auth: client });

  const auth = await prisma.userGoogleAuth.findUnique({
    where: { userId },
    select: { googleEmail: true },
  });
  const meuEmail = auth?.googleEmail.toLowerCase() ?? "";

  try {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread newer_than:1d -category:promotions -category:social",
      maxResults: 30,
    });

    await touchGoogleAuthUsage(userId);

    const ids = (list.data.messages ?? [])
      .map((m) => m.id)
      .filter((x): x is string => typeof x === "string");
    if (ids.length === 0) return [];

    const detalhes = await Promise.all(
      ids.map((id) =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "To", "Date"],
        }),
      ),
    );

    type Candidato = EmailAcao & { _ts: number };
    const candidatos: Candidato[] = [];
    for (const det of detalhes) {
      const msg = det.data;
      const id = msg.id ?? "";
      const threadId = msg.threadId ?? id;
      const headers = headersToMap(msg.payload?.headers);
      const assunto = headers["subject"] ?? "(sem assunto)";
      const remetenteRaw = headers["from"] ?? "(desconhecido)";
      const to = headers["to"] ?? "";
      const dateHeader = headers["date"];
      const internalDate = msg.internalDate ? Number(msg.internalDate) : null;
      const ts = internalDate ?? (dateHeader ? Date.parse(dateHeader) : Date.now());
      const snippet = (msg.snippet ?? "").trim();

      if (!pedeAcao({ assunto, snippet, to, meuEmail })) continue;

      candidatos.push({
        id,
        origem: "gmail",
        remetente: remetenteRaw,
        assunto,
        snippet,
        link: `https://mail.google.com/mail/u/0/#inbox/${threadId}`,
        recebidoEm: new Date(ts).toISOString(),
        _ts: ts,
      });
    }

    candidatos.sort((a, b) => b._ts - a._ts);
    return candidatos.slice(0, limit).map((c) => {
      const { _ts, ...rest } = c;
      void _ts;
      return rest;
    });
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await recordGoogleAuthError(userId, "invalid_grant — usuário precisa reconectar");
    }
    throw err;
  }
}

export { GoogleNotConnectedError };
export type { OAuth2Client };
