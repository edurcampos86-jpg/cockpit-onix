import "server-only";
import { prisma } from "@/lib/prisma";
import {
  listFutureCalendarEvents,
  listRecentCalendarEvents,
  type CalendarEventForMatching,
} from "@/lib/integrations/google-calendar";
import {
  upsertReuniao,
  recomputeAgregadosBatch,
} from "@/lib/reunioes";
import { buildClienteIndex, matchEventToClientes } from "@/lib/google-calendar-match";

/**
 * Sync de reuniões do Google Calendar com a base de clientes.
 *
 * Refactor 2026-05-18:
 * - Antes escrevia direto em ClienteBackoffice.{proxima,ultima}ReuniaoAt.
 * - Agora persiste cada match como ReuniaoCliente (source="google-cal",
 *   externalId=event.id) e recalcula os agregados no fim. Isso dá
 *   dedupe nativo com Outlook ICS e Datacrazy Atividades (que vão usar
 *   a mesma tabela quando forem migrados).
 * - `ultimoContatoAt` continua sendo atualizado direto aqui quando há
 *   reunião passada — não passa por ReuniaoCliente porque "último contato"
 *   é canal-agnóstico (não só reunião).
 *
 * Matching em 3 níveis, do mais seguro para o menos:
 *   1. ATTENDEE com e-mail exato do cliente (score 100)
 *   2. ORGANIZER com e-mail exato do cliente (score 100)
 *   3. SUMMARY contendo:
 *      a. ≥2 palavras fortes consecutivas do nome (score 30)
 *      b. 1 palavra forte ÚNICA na base (freq==1, ≥5 chars) (score 50)
 *
 * Cleanup: eventos que sumiram da janela atual do Calendar (cancelados/
 * deletados) são removidos da ReuniaoCliente — desde que estejam DENTRO
 * da janela de lookahead/lookback (eventos fora da janela ficam intactos
 * pra não serem apagados por mudança de configuração).
 */

export interface GoogleCalendarSyncResult {
  eventosFuturos: number;
  eventosPassados: number;
  reunioesUpsert: number;     // created+updated em ReuniaoCliente
  reunioesRemovidas: number;  // canceladas/deletadas na fonte → removidas aqui
  agregadosRecomputados: number;
  contatosAtualizados: number; // ultimoContatoAt atualizado a partir de reunião passada
  matchEmail: number;
  matchNomeUnico: number;
  matchNomeSubstring: number;
  erros: Array<{ etapa: string; motivo: string }>;
}

export async function syncGoogleCalendarComClientes(opts: {
  userId: string;
  lookaheadDias?: number;
  lookbackDias?: number;
}): Promise<GoogleCalendarSyncResult> {
  const { userId } = opts;
  const lookaheadDias = opts.lookaheadDias ?? 60;
  const lookbackDias = opts.lookbackDias ?? 30;

  const clientes = await prisma.clienteBackoffice.findMany({
    select: {
      id: true,
      nome: true,
      nomeCompleto: true,
      apelido: true,
      email: true,
      ultimoContatoAt: true,
    },
  });

  // Índice de matching (e-mail + nome nas 3 variantes) — lógica pura em
  // google-calendar-match.ts.
  const index = buildClienteIndex(clientes);

  // ultimoContatoAt é orquestração (não-matching), fica aqui.
  const clienteUltimoContato = new Map<string, Date | null>();
  for (const c of clientes) {
    clienteUltimoContato.set(c.id, c.ultimoContatoAt);
  }

  const erros: Array<{ etapa: string; motivo: string }> = [];

  // ── Buscar eventos
  let futuros: CalendarEventForMatching[] = [];
  let passados: CalendarEventForMatching[] = [];
  try {
    futuros = await listFutureCalendarEvents(userId, lookaheadDias);
  } catch (e) {
    erros.push({ etapa: "listFuture", motivo: e instanceof Error ? e.message : "?" });
  }
  try {
    passados = await listRecentCalendarEvents(userId, lookbackDias);
  } catch (e) {
    erros.push({ etapa: "listRecent", motivo: e instanceof Error ? e.message : "?" });
  }

  const todosEventos = [...futuros, ...passados];

  // ── Upsert cada match em ReuniaoCliente
  const clientesAfetados = new Set<string>();
  const externalIdsVistos = new Set<string>();
  let reunioesUpsert = 0;
  let matchEmail = 0;
  let matchNomeUnico = 0;
  let matchNomeSubstring = 0;

  // Pra Fix #3: maior reunião passada por cliente — usada pra atualizar
  // ultimoContatoAt (canal-agnóstico) no fim.
  const maiorPassadaPorCliente = new Map<string, Date>();

  for (const ev of todosEventos) {
    if (!ev.id) continue;
    externalIdsVistos.add(ev.id);

    const matches = matchEventToClientes(ev, index);

    for (const m of matches) {
      try {
        const r = await upsertReuniao({
          clienteId: m.clienteId,
          userId,
          source: "google-cal",
          externalId: ev.id,
          startAt: ev.start,
          endAt: ev.end,
          titulo: ev.summary || null,
          matchedVia: m.via,
        });
        if (r !== "noop") {
          reunioesUpsert++;
          clientesAfetados.add(m.clienteId);
        }
        if (m.via === "email") matchEmail++;
        else if (m.via === "nome-unico") matchNomeUnico++;
        else if (m.via === "nome-substring") matchNomeSubstring++;

        // Track maior reunião passada por cliente
        if (ev.start < new Date()) {
          const atual = maiorPassadaPorCliente.get(m.clienteId);
          if (!atual || ev.start > atual) {
            maiorPassadaPorCliente.set(m.clienteId, ev.start);
          }
        }
      } catch (e) {
        erros.push({
          etapa: `upsert ${m.clienteId}/${ev.id}`,
          motivo: e instanceof Error ? e.message : "?",
        });
      }
    }
  }

  // ── Cleanup: eventos da fonte google-cal que sumiram da janela atual
  // são deletados. Restrito à janela [agora - lookback, agora + lookahead]
  // pra não apagar reuniões antigas fora do escopo do sync atual.
  const agora = new Date();
  const janelaInicio = new Date(agora.getTime() - lookbackDias * 24 * 60 * 60 * 1000);
  const janelaFim = new Date(agora.getTime() + lookaheadDias * 24 * 60 * 60 * 1000);

  // Cleanup escopado por usuario — sem isso, o sync de User A apagaria
  // reunioes de User B (cross-user delete bug encontrado no review da Fase 2).
  const candidatasPraRemover = await prisma.reuniaoCliente.findMany({
    where: {
      userId,
      source: "google-cal",
      startAt: { gte: janelaInicio, lte: janelaFim },
    },
    select: { id: true, clienteId: true, externalId: true },
  });

  const idsPraRemover = candidatasPraRemover
    .filter((r) => !externalIdsVistos.has(r.externalId))
    .map((r) => ({ id: r.id, clienteId: r.clienteId }));

  let reunioesRemovidas = 0;
  if (idsPraRemover.length > 0) {
    const removeResult = await prisma.reuniaoCliente.deleteMany({
      where: { id: { in: idsPraRemover.map((x) => x.id) } },
    });
    reunioesRemovidas = removeResult.count;
    for (const x of idsPraRemover) clientesAfetados.add(x.clienteId);
  }

  // ── Recomputar agregados (proxima/ultimaReuniaoAt) pros clientes afetados
  const recompute = await recomputeAgregadosBatch(Array.from(clientesAfetados));

  // ── Fix #3: ultimoContatoAt ganha bump quando reunião passada é mais
  // recente que o contato atual. Mantém comportamento canal-agnóstico.
  let contatosAtualizados = 0;
  for (const [clienteId, maiorPassada] of maiorPassadaPorCliente) {
    const atual = clienteUltimoContato.get(clienteId);
    if (!atual || maiorPassada > atual) {
      try {
        await prisma.clienteBackoffice.update({
          where: { id: clienteId },
          data: { ultimoContatoAt: maiorPassada },
        });
        contatosAtualizados++;
      } catch (e) {
        erros.push({
          etapa: `contato ${clienteId}`,
          motivo: e instanceof Error ? e.message : "?",
        });
      }
    }
  }

  return {
    eventosFuturos: futuros.length,
    eventosPassados: passados.length,
    reunioesUpsert,
    reunioesRemovidas,
    agregadosRecomputados: recompute.atualizados,
    contatosAtualizados,
    matchEmail,
    matchNomeUnico,
    matchNomeSubstring,
    erros,
  };
}
