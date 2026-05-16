import "server-only";
import { prisma } from "@/lib/prisma";
import {
  listFutureCalendarEvents,
  listRecentCalendarEvents,
  type CalendarEventForMatching,
} from "@/lib/integrations/google-calendar";

/**
 * Sync de reuniões do Google Calendar com a base de clientes.
 *
 * - Eventos futuros (até `lookaheadDias`, default 60) alimentam
 *   `ClienteBackoffice.proximaReuniaoAt` com a data do próximo evento
 *   que casa com o cliente.
 * - Eventos passados recentes (até `lookbackDias`, default 30) alimentam
 *   `ClienteBackoffice.ultimaReuniaoAt` (sem regredir) com o evento
 *   passado mais recente que casa.
 *
 * Matching em 3 níveis, do mais seguro para o menos:
 *   1. ATTENDEE com e-mail exato do cliente (case-insensitive)
 *   2. ORGANIZER com e-mail exato do cliente
 *   3. SUMMARY contendo substring contígua com ≥2 palavras fortes do
 *      nome do cliente (≥4 chars, fora da lista de sobrenomes comuns)
 *
 * Substitui a função de `outlook-sync` que dependia só do SUMMARY
 * porque o ICS público do Outlook não expõe ATTENDEE — aqui via
 * Google Calendar API temos acesso direto aos participantes.
 */

const SOBRENOMES_COMUNS = new Set([
  "silva", "santos", "souza", "oliveira", "pereira", "ferreira", "alves",
  "lima", "gomes", "ribeiro", "carvalho", "araujo", "araújo", "almeida",
  "rodrigues", "nascimento", "barbosa", "rocha", "dias", "moreira",
  "nunes", "marques", "cardoso", "teixeira", "correia", "fernandes",
  "azevedo", "martins", "freitas", "barros", "pinto", "moura",
  "cavalcanti", "andrade", "costa", "junior", "neto", "filho",
  "de", "da", "do", "dos", "das",
]);

function substringsCandidatas(nome: string): string[] {
  const palavrasFortes = nome
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 4 && !SOBRENOMES_COMUNS.has(p));
  const out: string[] = [];
  for (let i = 0; i < palavrasFortes.length; i++) {
    for (let j = i + 2; j <= palavrasFortes.length; j++) {
      out.push(palavrasFortes.slice(i, j).join(" "));
    }
  }
  return out;
}

type MatchResult = { clienteId: string; via: "email" | "nome"; data: Date };

function matchEventToClientes(
  ev: CalendarEventForMatching,
  clientesIndexEmail: Map<string, string>, // email lc → clienteId
  clientesByNomeSubstr: Map<string, string[]>, // substr → [clienteId]
): MatchResult[] {
  const matches = new Map<string, "email" | "nome">();

  // 1+2. Identidade via e-mail (attendee ou organizer)
  for (const email of [...ev.attendees, ev.organizer].filter(
    (e): e is string => !!e,
  )) {
    const clienteId = clientesIndexEmail.get(email);
    if (clienteId && !matches.has(clienteId)) {
      matches.set(clienteId, "email");
    }
  }

  // 3. Fallback: substring do nome no SUMMARY
  if (ev.summary) {
    const summaryLC = ev.summary.toLowerCase();
    for (const [substr, clienteIds] of clientesByNomeSubstr) {
      if (!summaryLC.includes(substr)) continue;
      for (const id of clienteIds) {
        if (!matches.has(id)) matches.set(id, "nome");
      }
    }
  }

  return Array.from(matches.entries()).map(([clienteId, via]) => ({
    clienteId,
    via,
    data: ev.start,
  }));
}

export interface GoogleCalendarSyncResult {
  eventosFuturos: number;
  eventosPassados: number;
  proximasAtualizadas: number;
  ultimasAtualizadas: number;
  matchEmail: number;
  matchNome: number;
  erros: Array<{ etapa: string; motivo: string }>;
}

export async function syncGoogleCalendarComClientes(opts: {
  lookaheadDias?: number;
  lookbackDias?: number;
}): Promise<GoogleCalendarSyncResult> {
  const lookaheadDias = opts.lookaheadDias ?? 60;
  const lookbackDias = opts.lookbackDias ?? 30;

  const clientes = await prisma.clienteBackoffice.findMany({
    select: { id: true, nome: true, email: true, ultimaReuniaoAt: true },
  });

  // Indexar para matching rápido
  const clientesIndexEmail = new Map<string, string>();
  const clientesByNomeSubstr = new Map<string, string[]>();
  const clienteUltimaReuniao = new Map<string, Date | null>();
  for (const c of clientes) {
    clienteUltimaReuniao.set(c.id, c.ultimaReuniaoAt);
    const email = (c.email || "").toLowerCase().trim();
    if (email) clientesIndexEmail.set(email, c.id);
    for (const s of substringsCandidatas(c.nome)) {
      const list = clientesByNomeSubstr.get(s) ?? [];
      list.push(c.id);
      clientesByNomeSubstr.set(s, list);
    }
  }

  const erros: Array<{ etapa: string; motivo: string }> = [];

  // ── Futuros → proximaReuniaoAt
  let futuros: CalendarEventForMatching[] = [];
  try {
    futuros = await listFutureCalendarEvents(lookaheadDias);
  } catch (e) {
    erros.push({
      etapa: "listFuture",
      motivo: e instanceof Error ? e.message : "?",
    });
  }

  // proximaPorCliente[clienteId] = data mais próxima encontrada
  const proximaPorCliente = new Map<string, Date>();
  let matchEmail = 0;
  let matchNome = 0;
  for (const ev of futuros) {
    const matches = matchEventToClientes(
      ev,
      clientesIndexEmail,
      clientesByNomeSubstr,
    );
    for (const m of matches) {
      const atual = proximaPorCliente.get(m.clienteId);
      if (!atual || ev.start < atual) {
        proximaPorCliente.set(m.clienteId, ev.start);
        if (m.via === "email") matchEmail++;
        else matchNome++;
      }
    }
  }

  // ── Passados → ultimaReuniaoAt (não regride)
  let passados: CalendarEventForMatching[] = [];
  try {
    passados = await listRecentCalendarEvents(lookbackDias);
  } catch (e) {
    erros.push({
      etapa: "listRecent",
      motivo: e instanceof Error ? e.message : "?",
    });
  }

  const ultimaPorCliente = new Map<string, Date>();
  for (const ev of passados) {
    const matches = matchEventToClientes(
      ev,
      clientesIndexEmail,
      clientesByNomeSubstr,
    );
    for (const m of matches) {
      const atual = ultimaPorCliente.get(m.clienteId);
      if (!atual || ev.start > atual) {
        ultimaPorCliente.set(m.clienteId, ev.start);
      }
    }
  }

  // ── Persistir
  let proximasAtualizadas = 0;
  let ultimasAtualizadas = 0;
  for (const c of clientes) {
    const nova = proximaPorCliente.get(c.id);
    const passada = ultimaPorCliente.get(c.id);
    const atual = clienteUltimaReuniao.get(c.id);
    const ultimaPraSalvar =
      passada && (!atual || passada > atual) ? passada : undefined;
    if (!nova && !ultimaPraSalvar) continue;
    try {
      await prisma.clienteBackoffice.update({
        where: { id: c.id },
        data: {
          ...(nova && { proximaReuniaoAt: nova }),
          ...(ultimaPraSalvar && { ultimaReuniaoAt: ultimaPraSalvar }),
        },
      });
      if (nova) proximasAtualizadas++;
      if (ultimaPraSalvar) ultimasAtualizadas++;
    } catch (e) {
      erros.push({
        etapa: `update ${c.id}`,
        motivo: e instanceof Error ? e.message : "?",
      });
    }
  }

  return {
    eventosFuturos: futuros.length,
    eventosPassados: passados.length,
    proximasAtualizadas,
    ultimasAtualizadas,
    matchEmail,
    matchNome,
    erros,
  };
}
