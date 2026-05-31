import type { ReuniaoMatchedVia } from "@/lib/reunioes";

/**
 * Matching PURO de eventos de calendário → clientes (sem IO).
 *
 * Separado de `google-calendar-clientes-sync.ts` (que tem prisma + Google API)
 * pra ser unit-testável sem subir servidor. A lógica de scoring vive aqui;
 * o sync só orquestra (buscar eventos, persistir ReuniaoCliente, recomputar).
 *
 * Matching em 3 níveis, do mais seguro pro menos:
 *   1. ATTENDEE/ORGANIZER com e-mail exato do cliente ........ score 100 (email)
 *   2. SUMMARY com 1 palavra forte ÚNICA na base (≥5 chars) ... score 50  (nome-unico)
 *   3. SUMMARY com ≥2 palavras fortes consecutivas do nome .... score 30  (nome-substring)
 *
 * Recall (FIX A): o índice cobre as TRÊS variantes de nome do cliente —
 * `nome` (curto, Base_BTG), `nomeCompleto` (formal, Informações) e
 * `apelido` (manual). Um evento pode usar qualquer uma delas.
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

export function palavrasFortesDo(nome: string): string[] {
  return nome
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 4 && !SOBRENOMES_COMUNS.has(p));
}

export function substringsCandidatas(nome: string): string[] {
  const palavrasFortes = palavrasFortesDo(nome);
  const out: string[] = [];
  for (let i = 0; i < palavrasFortes.length; i++) {
    for (let j = i + 2; j <= palavrasFortes.length; j++) {
      out.push(palavrasFortes.slice(i, j).join(" "));
    }
  }
  return out;
}

export type ClienteNome = {
  nome: string;
  nomeCompleto?: string | null;
  apelido?: string | null;
};

export type ClienteParaMatch = ClienteNome & {
  id: string;
  email?: string | null;
};

// As três variantes de nome, ignorando vazias.
export function variantesNome(c: ClienteNome): string[] {
  return [c.nome, c.nomeCompleto, c.apelido].filter(
    (s): s is string => !!s && s.trim().length > 0,
  );
}

// Palavras fortes de TODAS as variantes, dedupadas por cliente — assim o
// mesmo primeiro nome em `nome` e `nomeCompleto` conta UMA vez no freq global
// (não infla e não quebra a detecção de "nome único na base").
export function palavrasFortesCliente(c: ClienteNome): Set<string> {
  const set = new Set<string>();
  for (const v of variantesNome(c)) {
    for (const p of palavrasFortesDo(v)) set.add(p);
  }
  return set;
}

// Substrings candidatas (2+ palavras fortes consecutivas) de todas as variantes.
export function substringsCliente(c: ClienteNome): Set<string> {
  const set = new Set<string>();
  for (const v of variantesNome(c)) {
    for (const s of substringsCandidatas(v)) set.add(s);
  }
  return set;
}

export interface ClienteIndex {
  clientesIndexEmail: Map<string, string>; // email lc → clienteId
  clientesByNomeUnico: Map<string, string>; // palavra única → clienteId
  clientesByNomeSubstr: Map<string, string[]>; // substring 2+ palavras → clienteIds
}

/**
 * Constrói os índices de matching a partir da carteira inteira.
 * Puro: dado o mesmo array de clientes, produz sempre o mesmo índice.
 */
export function buildClienteIndex(clientes: ClienteParaMatch[]): ClienteIndex {
  const clientesIndexEmail = new Map<string, string>();
  const clientesByNomeUnico = new Map<string, string>();
  const clientesByNomeSubstr = new Map<string, string[]>();

  // Frequência de cada palavra forte na base (3 variantes, dedup por cliente).
  const wordCount = new Map<string, number>();
  for (const c of clientes) {
    for (const p of palavrasFortesCliente(c)) {
      wordCount.set(p, (wordCount.get(p) ?? 0) + 1);
    }
  }

  for (const c of clientes) {
    const email = (c.email || "").toLowerCase().trim();
    if (email) clientesIndexEmail.set(email, c.id);

    for (const s of substringsCliente(c)) {
      const list = clientesByNomeSubstr.get(s) ?? [];
      list.push(c.id);
      clientesByNomeSubstr.set(s, list);
    }

    for (const p of palavrasFortesCliente(c)) {
      if (p.length >= 5 && wordCount.get(p) === 1) {
        clientesByNomeUnico.set(p, c.id);
      }
    }
  }

  return { clientesIndexEmail, clientesByNomeUnico, clientesByNomeSubstr };
}

export type EventoParaMatch = {
  attendees: string[];
  organizer: string | null;
  summary: string | null;
};

export type MatchResult = {
  clienteId: string;
  via: ReuniaoMatchedVia;
};

export function matchEventToClientes(
  ev: EventoParaMatch,
  index: ClienteIndex,
): MatchResult[] {
  const { clientesIndexEmail, clientesByNomeUnico, clientesByNomeSubstr } = index;
  const matches = new Map<string, ReuniaoMatchedVia>();

  // 1+2. Identidade via e-mail (attendee ou organizer) — score 100
  for (const email of [...ev.attendees, ev.organizer].filter(
    (e): e is string => !!e,
  )) {
    const clienteId = clientesIndexEmail.get(email.toLowerCase().trim());
    if (clienteId && !matches.has(clienteId)) {
      matches.set(clienteId, "email");
    }
  }

  if (!ev.summary) {
    return Array.from(matches.entries()).map(([clienteId, via]) => ({ clienteId, via }));
  }

  const summaryLC = ev.summary.toLowerCase();

  // 3a. Nome único (1 palavra forte, freq==1, ≥5 chars) — score 50
  // Quebra por palavras pra evitar false positive no meio de outra palavra.
  const wordsInSummary = new Set(
    summaryLC.split(/\s+/).map((w) => w.replace(/[^\w]/g, "")),
  );
  for (const [palavra, clienteId] of clientesByNomeUnico) {
    if (wordsInSummary.has(palavra) && !matches.has(clienteId)) {
      matches.set(clienteId, "nome-unico");
    }
  }

  // 3b. Substring 2+ palavras fortes consecutivas — score 30 (baixa confiança)
  for (const [substr, clienteIds] of clientesByNomeSubstr) {
    if (!summaryLC.includes(substr)) continue;
    for (const id of clienteIds) {
      if (!matches.has(id)) matches.set(id, "nome-substring");
    }
  }

  return Array.from(matches.entries()).map(([clienteId, via]) => ({ clienteId, via }));
}
