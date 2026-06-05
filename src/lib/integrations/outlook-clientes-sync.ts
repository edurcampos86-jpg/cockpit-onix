import "server-only";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { fetchIcsEvents, type IcsEvent } from "@/lib/integrations/outlook-ics";
import {
  upsertReuniao,
  recomputeAgregadosBatch,
  type ReuniaoMatchedVia,
} from "@/lib/reunioes";
import { reunioesParaRemover } from "@/lib/integrations/reunioes-cleanup";

/**
 * Sync de reuniões do Outlook (ICS público) → ReuniaoCliente
 * (source="outlook-ics").
 *
 * Refactor 2026-05-18:
 * - Antes escrevia direto em ClienteBackoffice.proximaReuniaoAt sobrescrevendo
 *   o que o Google Cal tinha gravado (mesmo bug que o Google Cal sync tinha
 *   antes — última escrita ganha).
 * - Bug histórico corrigido: linha que procurava e-mail dentro do título
 *   (summaryLC.includes(emailLC)) — falso shortcut que nunca casava.
 * - Adicionado: cobertura de eventos passados → ultimaReuniaoAt via agregado.
 *
 * Matching (mesmas regras do Google Cal sync):
 *   1. ATTENDEE com e-mail exato (score 100)
 *   2. ORGANIZER com e-mail exato (score 100)
 *   3. SUMMARY contém 1 palavra única (freq==1, ≥5 chars) — score 50
 *   4. SUMMARY contém ≥2 palavras fortes consecutivas — score 30
 *
 * Cleanup: eventos canceladas/deletados na fonte (sumiram da janela atual)
 * são removidos de ReuniaoCliente, restrito à janela [now - lookback, now + lookahead].
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

function palavrasFortesDo(nome: string): string[] {
  return nome
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 4 && !SOBRENOMES_COMUNS.has(p));
}

function substringsCandidatas(nome: string): string[] {
  const palavrasFortes = palavrasFortesDo(nome);
  const out: string[] = [];
  for (let i = 0; i < palavrasFortes.length; i++) {
    for (let j = i + 2; j <= palavrasFortes.length; j++) {
      out.push(palavrasFortes.slice(i, j).join(" "));
    }
  }
  return out;
}

type MatchResult = { clienteId: string; via: ReuniaoMatchedVia };

function matchEventToClientes(
  ev: IcsEvent,
  clientesIndexEmail: Map<string, string>,
  clientesByNomeUnico: Map<string, string>,
  clientesByNomeSubstr: Map<string, string[]>,
): MatchResult[] {
  const matches = new Map<string, ReuniaoMatchedVia>();

  // 1+2. E-mail (attendee ou organizer)
  for (const email of [...ev.attendees, ev.organizer].filter(
    (e): e is string => !!e,
  )) {
    const clienteId = clientesIndexEmail.get(email);
    if (clienteId && !matches.has(clienteId)) {
      matches.set(clienteId, "email");
    }
  }

  if (!ev.summary) {
    return Array.from(matches.entries()).map(([clienteId, via]) => ({ clienteId, via }));
  }

  const summaryLC = ev.summary.toLowerCase();

  // 3. Nome único (1 palavra forte, freq==1, ≥5 chars)
  const wordsInSummary = new Set(
    summaryLC.split(/\s+/).map((w) => w.replace(/[^\w]/g, "")),
  );
  for (const [palavra, clienteId] of clientesByNomeUnico) {
    if (wordsInSummary.has(palavra) && !matches.has(clienteId)) {
      matches.set(clienteId, "nome-unico");
    }
  }

  // 4. Substring 2+ palavras consecutivas
  for (const [substr, clienteIds] of clientesByNomeSubstr) {
    if (!summaryLC.includes(substr)) continue;
    for (const id of clienteIds) {
      if (!matches.has(id)) matches.set(id, "nome-substring");
    }
  }

  return Array.from(matches.entries()).map(([clienteId, via]) => ({ clienteId, via }));
}

export interface OutlookSyncResult {
  icsUrlConfigurado: boolean;
  eventosTotal: number;
  eventosNaJanela: number;
  reunioesUpsert: number;
  reunioesRemovidas: number;
  agregadosRecomputados: number;
  contatosAtualizados: number;
  matchEmail: number;
  matchNomeUnico: number;
  matchNomeSubstring: number;
  erros: Array<{ etapa: string; motivo: string }>;
}

export async function syncOutlookIcsComClientes(opts: {
  lookaheadDias?: number;
  lookbackDias?: number;
}): Promise<OutlookSyncResult> {
  const lookaheadDias = opts.lookaheadDias ?? 60;
  const lookbackDias = opts.lookbackDias ?? 30;

  const erros: Array<{ etapa: string; motivo: string }> = [];

  const icsUrl = await getConfig("OUTLOOK_ICS_URL");
  if (!icsUrl) {
    return {
      icsUrlConfigurado: false,
      eventosTotal: 0,
      eventosNaJanela: 0,
      reunioesUpsert: 0,
      reunioesRemovidas: 0,
      agregadosRecomputados: 0,
      contatosAtualizados: 0,
      matchEmail: 0,
      matchNomeUnico: 0,
      matchNomeSubstring: 0,
      erros: [{ etapa: "config", motivo: "OUTLOOK_ICS_URL não configurada" }],
    };
  }

  // ── Buscar eventos
  // `fetchOk` precisa virar false se a listagem falhar — o cleanup deleta com
  // base em "o que NÃO apareceu no fetch"; sobre fetch falho isso apagaria
  // reuniões válidas (mesmo bug do google-calendar-clientes-sync).
  let events: IcsEvent[] = [];
  let fetchOk = true;
  try {
    events = await fetchIcsEvents(icsUrl);
  } catch (e) {
    fetchOk = false;
    erros.push({ etapa: "fetchIcs", motivo: e instanceof Error ? e.message : "?" });
  }

  const agora = new Date();
  const janelaInicio = new Date(agora.getTime() - lookbackDias * 24 * 60 * 60 * 1000);
  const janelaFim = new Date(agora.getTime() + lookaheadDias * 24 * 60 * 60 * 1000);

  const naJanela = events.filter(
    (e) => e.dtstart >= janelaInicio && e.dtstart <= janelaFim,
  );

  // ── Indexar clientes
  const clientes = await prisma.clienteBackoffice.findMany({
    select: { id: true, nome: true, email: true, ultimoContatoAt: true },
  });

  const clientesIndexEmail = new Map<string, string>();
  const clientesByNomeSubstr = new Map<string, string[]>();
  const clientesByNomeUnico = new Map<string, string>();
  const clienteUltimoContato = new Map<string, Date | null>();

  const wordCount = new Map<string, number>();
  for (const c of clientes) {
    for (const p of palavrasFortesDo(c.nome)) {
      wordCount.set(p, (wordCount.get(p) ?? 0) + 1);
    }
  }

  for (const c of clientes) {
    clienteUltimoContato.set(c.id, c.ultimoContatoAt);
    const email = (c.email || "").toLowerCase().trim();
    if (email) clientesIndexEmail.set(email, c.id);
    for (const s of substringsCandidatas(c.nome)) {
      const list = clientesByNomeSubstr.get(s) ?? [];
      list.push(c.id);
      clientesByNomeSubstr.set(s, list);
    }
    for (const p of palavrasFortesDo(c.nome)) {
      if (p.length >= 5 && wordCount.get(p) === 1) {
        clientesByNomeUnico.set(p, c.id);
      }
    }
  }

  // ── Upsert
  const clientesAfetados = new Set<string>();
  const externalIdsVistos = new Set<string>();
  let reunioesUpsert = 0;
  let matchEmail = 0;
  let matchNomeUnico = 0;
  let matchNomeSubstring = 0;
  const maiorPassadaPorCliente = new Map<string, Date>();

  for (const ev of naJanela) {
    if (!ev.uid) continue;
    externalIdsVistos.add(ev.uid);

    const matches = matchEventToClientes(
      ev,
      clientesIndexEmail,
      clientesByNomeUnico,
      clientesByNomeSubstr,
    );

    for (const m of matches) {
      try {
        const r = await upsertReuniao({
          clienteId: m.clienteId,
          source: "outlook-ics",
          externalId: ev.uid,
          startAt: ev.dtstart,
          endAt: ev.dtend,
          titulo: ev.summary,
          matchedVia: m.via,
        });
        if (r !== "noop") {
          reunioesUpsert++;
          clientesAfetados.add(m.clienteId);
        }
        if (m.via === "email") matchEmail++;
        else if (m.via === "nome-unico") matchNomeUnico++;
        else if (m.via === "nome-substring") matchNomeSubstring++;

        if (ev.dtstart < agora) {
          const atual = maiorPassadaPorCliente.get(m.clienteId);
          if (!atual || ev.dtstart > atual) {
            maiorPassadaPorCliente.set(m.clienteId, ev.dtstart);
          }
        }
      } catch (e) {
        erros.push({
          etapa: `upsert ${m.clienteId}/${ev.uid}`,
          motivo: e instanceof Error ? e.message : "?",
        });
      }
    }
  }

  // ── Cleanup — só sobre fetch que teve sucesso real (ver fetchOk acima).
  let reunioesRemovidas = 0;
  if (!fetchOk) {
    erros.push({
      etapa: "cleanup",
      motivo:
        "pulado — fetchIcs falhou; cleanup não roda sobre fetch incompleto (evita deleção em massa)",
    });
  } else {
    const candidatas = await prisma.reuniaoCliente.findMany({
      where: {
        source: "outlook-ics",
        startAt: { gte: janelaInicio, lte: janelaFim },
      },
      select: { id: true, clienteId: true, externalId: true },
    });
    const removerIds = reunioesParaRemover(fetchOk, candidatas, externalIdsVistos);

    if (removerIds.length > 0) {
      const r = await prisma.reuniaoCliente.deleteMany({
        where: { id: { in: removerIds.map((x) => x.id) } },
      });
      reunioesRemovidas = r.count;
      for (const x of removerIds) clientesAfetados.add(x.clienteId);
    }
  }

  // ── Recompute agregados
  const recompute = await recomputeAgregadosBatch(Array.from(clientesAfetados));

  // ── ultimoContatoAt — bump pra reuniões passadas
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
    icsUrlConfigurado: true,
    eventosTotal: events.length,
    eventosNaJanela: naJanela.length,
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
