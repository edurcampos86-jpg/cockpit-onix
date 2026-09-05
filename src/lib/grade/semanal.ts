/**
 * A grade semanal — módulo PURO. UMA lista: qual peça publica em cada dia.
 *
 * ── O QUE ESTA LISTA É, E O QUE ELA NÃO É ───────────────────────────────
 * Ela guarda SÓ o par dia → peça. Formato, CTA, rótulo narrativo e âncora
 * pendem da peça (`pecas.ts`), não daqui. É essa separação que torna barato
 * testar outro formato de semana: mexe-se nesta lista e mais nada.
 *
 * ── ESTA GRADE AINDA É A v4 ─────────────────────────────────────────────
 * De propósito. Esta PR é refatoração: o conteúdo tem de continuar
 * idêntico para que dê para conferir que nada mudou de comportamento. A
 * semana v7 (Ter–Sáb, Patrimônio na sexta) entra numa PR própria, e aí o
 * diff mostra só a mudança editorial, sem refatoração misturada.
 *
 * ── ANTES ELA ESTAVA EM QUATRO LUGARES ──────────────────────────────────
 * `CATEGORY_DAYS` e `DAY_CATEGORY_MAP` (um o inverso do outro, mantidos à
 * mão em `lib/types.ts`), `DAY_FORMAT_MAP`, e uma quarta cópia dentro de
 * `calendar-week-grid.tsx`. Nenhuma sabia das outras.
 */

import type { PostCategory } from "@/lib/types";
import { PECAS, pecaDe, type Peca } from "./pecas";

/** Dia da semana no padrão do JavaScript: 0 = domingo … 6 = sábado. */
export type DiaDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PosicaoDaGrade {
  dia: DiaDaSemana;
  categoria: PostCategory;
}

/**
 * A grade vigente (v4). Dias sem posição simplesmente não aparecem —
 * ausência é a forma de dizer "não publica".
 */
export const GRADE: readonly PosicaoDaGrade[] = [
  { dia: 1, categoria: "pergunta_semana" },    // Segunda
  { dia: 2, categoria: "onix_pratica" },       // Terça
  { dia: 3, categoria: "patrimonio_mimimi" },  // Quarta
  { dia: 4, categoria: "alerta_patrimonial" }, // Quinta
  { dia: 6, categoria: "sabado_bastidores" },  // Sábado
];

/** Quantas peças a semana publica. A meta de `/kpis` sai daqui. */
export const PECAS_POR_SEMANA = GRADE.length;

const POR_DIA = new Map<number, PosicaoDaGrade>(GRADE.map((p) => [p.dia, p]));
const POR_CATEGORIA = new Map<PostCategory, PosicaoDaGrade>(
  GRADE.map((p) => [p.categoria, p]),
);

/** A peça que publica neste dia, ou `undefined` se o dia não publica. */
export function pecaDoDia(dia: number): Peca | undefined {
  const posicao = POR_DIA.get(dia);
  return posicao ? pecaDe(posicao.categoria) : undefined;
}

/** O dia em que esta peça publica, ou `undefined` se ela saiu da grade. */
export function diaDaPeca(categoria: PostCategory): number | undefined {
  return POR_CATEGORIA.get(categoria)?.dia;
}

/** As categorias que a semana exige, na ordem dos dias. */
export function categoriasDaSemana(): PostCategory[] {
  return GRADE.map((p) => p.categoria);
}

/**
 * Peças que existem mas estão fora da grade vigente.
 *
 * Hoje é lista vazia — as cinco peças estão nos cinco dias. Existe porque a
 * v7 tira a segunda-feira e põe a sexta, e um dia a grade pode ter menos
 * posições que peças. Quem pergunta "o que sobrou de fora?" não deveria
 * descobrir isso comparando duas listas na mão.
 */
export function pecasForaDaGrade(): Peca[] {
  const naGrade = new Set(GRADE.map((p) => p.categoria));
  return PECAS.filter((p) => !naGrade.has(p.categoria));
}
