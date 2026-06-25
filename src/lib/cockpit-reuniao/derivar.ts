/**
 * Derivações PURAS para a leitura rica do Cockpit de Reunião (PR-B).
 *
 * Recebe as reuniões estruturadas JÁ gravadas (escrita do PR-A) e produz os
 * view-models dos 3 blocos de leitura: retrato entrada→agora, top pautas e
 * pendências por lado. Sem I/O, sem dependência de React.
 *
 * Parsing DEFENSIVO: os campos `pautas` / `pendencias` / `proximosPassos` são
 * `Json?` no banco e chegam como `unknown` após serialização. Podem vir `null`,
 * malformados ou com shape antigo — NUNCA lançamos exceção; degradamos para
 * vazio. O dedupe de pautas é por igualdade normalizada (acentos/caixa/espaços),
 * NÃO semântico — paráfrases não colapsam (fica para um PR futuro).
 */

import type { ItemAcionavel } from "./tipos";

/**
 * Shape mínimo de uma reunião estruturada serializada que estas funções
 * consomem. Estruturalmente compatível com `ReuniaoEstruturadaView` do
 * componente — evitamos um import lib→componente.
 */
export interface ReuniaoEstruturadaInput {
  id: string;
  data: string;
  tipoCadencia: string | null;
  pessoa: { nomeCompleto: string; apelido: string | null } | null;
  pautas: unknown;
  pendencias: unknown;
  proximosPassos: unknown;
}

/** Reunião achatada para os cards das colunas entrada/agora. */
export interface ReuniaoView {
  id: string;
  data: string;
  tipoCadencia: string | null; // valor cru; o componente aplica `rotuloCadencia`
  conduzidoPor: string | null;
  pautas: string[];
  totalPendencias: number;
  proximosPassos: string[];
}

/** Item de pendência aberta, com a data da reunião de origem. */
export interface ItemView {
  texto: string;
  reuniaoData: string;
}

// ── Parsing defensivo ──

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Extrai o texto de um item (string crua ou `{ texto }`). Vazio → null. */
function textoDe(item: unknown): string | null {
  if (typeof item === "string") return item.trim() || null;
  if (item && typeof item === "object" && "texto" in item) {
    const t = (item as { texto?: unknown }).texto;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return null;
}

/** Lista de pautas → textos não-vazios. */
function parsePautas(v: unknown): string[] {
  return asArray(v)
    .map(textoDe)
    .filter((t): t is string => t !== null);
}

/** Itens acionáveis (pendências/próximos passos). `concluido` ausente → false (aberto). */
function parseItens(v: unknown): ItemAcionavel[] {
  const out: ItemAcionavel[] = [];
  for (const raw of asArray(v)) {
    const texto = textoDe(raw);
    if (!texto) continue;
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    out.push({
      texto,
      concluido: o.concluido === true,
      concluidoEm: typeof o.concluidoEm === "string" ? o.concluidoEm : null,
    });
  }
  return out;
}

/** Pendências por lado. Shape inválido → ambos vazios. */
function parsePendencias(v: unknown): { assessor: ItemAcionavel[]; cliente: ItemAcionavel[] } {
  if (!v || typeof v !== "object") return { assessor: [], cliente: [] };
  const o = v as { assessor?: unknown; cliente?: unknown };
  return { assessor: parseItens(o.assessor), cliente: parseItens(o.cliente) };
}

/** Timestamp seguro; data inválida → 0 (não quebra a ordenação). */
function ts(iso: string): number {
  const n = new Date(iso).getTime();
  return Number.isNaN(n) ? 0 : n;
}

/** Chave de comparação: minúsculas, sem acento, espaços colapsados, trim. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function nomePessoa(p: ReuniaoEstruturadaInput["pessoa"]): string | null {
  if (!p) return null;
  return p.apelido?.trim() || p.nomeCompleto?.trim() || null;
}

function toView(r: ReuniaoEstruturadaInput): ReuniaoView {
  const pend = parsePendencias(r.pendencias);
  return {
    id: r.id,
    data: r.data,
    tipoCadencia: r.tipoCadencia,
    conduzidoPor: nomePessoa(r.pessoa),
    pautas: parsePautas(r.pautas),
    totalPendencias: pend.assessor.length + pend.cliente.length,
    proximosPassos: parseItens(r.proximosPassos).map((i) => i.texto),
  };
}

// ── Derivações ──

/**
 * Colunas do retrato: `entrada` = 3 PRIMEIRAS por data asc; `agora` = 3 ÚLTIMAS
 * por data desc. Sobreposição livre — com poucas reuniões os lados repetem (ok).
 */
export function derivarColunas(reunioes: ReuniaoEstruturadaInput[]): {
  entrada: ReuniaoView[];
  agora: ReuniaoView[];
} {
  const asc = [...reunioes].sort((a, b) => ts(a.data) - ts(b.data));
  const entrada = asc.slice(0, 3).map(toView);
  const agora = [...asc].reverse().slice(0, 3).map(toView);
  return { entrada, agora };
}

/**
 * Top 5 pautas das 3 ÚLTIMAS reuniões. Dedupe/contagem por chave normalizada,
 * exibindo o primeiro texto original (com acentos). Ordenado por frequência desc.
 */
export function derivarTopPautas(
  reunioes: ReuniaoEstruturadaInput[],
): { texto: string; freq: number }[] {
  const tresUltimas = [...reunioes].sort((a, b) => ts(b.data) - ts(a.data)).slice(0, 3);
  const mapa = new Map<string, { texto: string; freq: number }>();
  for (const r of tresUltimas) {
    for (const texto of parsePautas(r.pautas)) {
      const chave = normalizar(texto);
      if (!chave) continue;
      const ex = mapa.get(chave);
      if (ex) ex.freq += 1;
      else mapa.set(chave, { texto, freq: 1 });
    }
  }
  return [...mapa.values()].sort((a, b) => b.freq - a.freq).slice(0, 5);
}

/**
 * Pendências ABERTAS (`concluido === false`) agregadas across TODAS as reuniões,
 * separadas por lado e ordenadas da reunião mais recente para a mais antiga.
 */
export function derivarPendenciasAbertas(reunioes: ReuniaoEstruturadaInput[]): {
  assessor: ItemView[];
  cliente: ItemView[];
} {
  const assessor: ItemView[] = [];
  const cliente: ItemView[] = [];
  for (const r of reunioes) {
    const pend = parsePendencias(r.pendencias);
    for (const it of pend.assessor) {
      if (!it.concluido) assessor.push({ texto: it.texto, reuniaoData: r.data });
    }
    for (const it of pend.cliente) {
      if (!it.concluido) cliente.push({ texto: it.texto, reuniaoData: r.data });
    }
  }
  const recentesPrimeiro = (a: ItemView, b: ItemView) => ts(b.reuniaoData) - ts(a.reuniaoData);
  return { assessor: assessor.sort(recentesPrimeiro), cliente: cliente.sort(recentesPrimeiro) };
}
