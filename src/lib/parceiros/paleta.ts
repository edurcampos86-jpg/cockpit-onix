/* ──────────────────────────────────────────────────────────────
 * Paleta das telas de Parceiros — módulo PURO, sem React e sem banco.
 *
 * ── POR QUE UMA PALETA PRÓPRIA, E POR QUE ELA É PEQUENA ──────────────────
 * O app já tem identidade: ouro `#FFB114` sobre creme `#FAF9F5` (claro) e
 * quase-preto `#080808` (escuro), em `globals.css`. A identidade pedida para
 * Parceiros — ouro `#A87A2E`, azul `#0D1B2A`, off-white — NÃO é a mesma, e
 * trocar os tokens globais repintaria o sistema inteiro por causa de duas
 * telas.
 *
 * A saída é a de menor risco: a estrutura (fundo, texto, borda, card) segue
 * usando os tokens globais, que já resolvem claro e escuro; a paleta abaixo
 * entra só como ACENTO das telas de Parceiros. Duas identidades convivendo em
 * regiões declaradas é diferente de duas identidades brigando na mesma tela.
 *
 * ── CONTRASTE É MEDIDO, NÃO OPINADO ──────────────────────────────────────
 * `contraste()` é a fórmula da WCAG 2.1 (luminância relativa). Os pares que as
 * telas realmente usam estão travados em `paleta.test.ts` — mudar um hex e
 * quebrar o AA reprova o CI em vez de chegar na tela de alguém.
 *
 * O par que exige atenção: OURO sobre CREME dá ~3.7:1. Isso é AA para texto
 * GRANDE (≥18.66px bold ou ≥24px) e para componentes de interface, e NÃO é AA
 * para texto corrido. Por isso o ouro aparece em título, ícone, borda e chip —
 * nunca em parágrafo. No tema escuro o mesmo ouro sobre o azul passa de 4.5:1
 * e poderia ser usado em texto pequeno; manter o mesmo papel nos dois temas é
 * decisão de consistência, não limitação técnica.
 * ────────────────────────────────────────────────────────────── */

export const PALETA_PARCEIROS = {
  /** Ouro da identidade pedida. Acento: título, ícone, borda, chip. */
  ouro: "#A87A2E",
  /** Azul escuro. Superfície de destaque no tema escuro; texto forte no claro. */
  azul: "#0D1B2A",
  /** Off-white — superfície das telas no tema claro. */
  offWhite: "#FAF9F5",
} as const;

/** Canal 0–255 → componente linearizado da luminância relativa (WCAG 2.1). */
function canalLinear(valor255: number): number {
  const c = valor255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** `#RGB` ou `#RRGGBB` → [r, g, b] em 0–255. Lança em entrada inválida. */
export function hexParaRgb(hex: string): [number, number, number] {
  const limpo = hex.trim().replace(/^#/, "");
  const cheio =
    limpo.length === 3
      ? limpo
          .split("")
          .map((c) => c + c)
          .join("")
      : limpo;
  if (!/^[0-9a-fA-F]{6}$/.test(cheio)) {
    throw new Error(`Hex inválido: ${JSON.stringify(hex)}`);
  }
  return [
    parseInt(cheio.slice(0, 2), 16),
    parseInt(cheio.slice(2, 4), 16),
    parseInt(cheio.slice(4, 6), 16),
  ];
}

/** Luminância relativa WCAG 2.1 de uma cor sólida. */
export function luminancia(hex: string): number {
  const [r, g, b] = hexParaRgb(hex);
  return (
    0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b)
  );
}

/**
 * Razão de contraste entre duas cores sólidas, de 1 (igual) a 21 (preto/branco).
 * Simétrica: a ordem dos argumentos não muda o resultado.
 */
export function contraste(corA: string, corB: string): number {
  const a = luminancia(corA);
  const b = luminancia(corB);
  const claro = Math.max(a, b);
  const escuro = Math.min(a, b);
  return (claro + 0.05) / (escuro + 0.05);
}

/** AA para texto corrido: 4.5:1. */
export const AA_TEXTO = 4.5;
/** AA para texto grande e componentes de interface: 3:1. */
export const AA_GRANDE = 3;

export const passaAaTexto = (fg: string, bg: string) =>
  contraste(fg, bg) >= AA_TEXTO;
export const passaAaGrande = (fg: string, bg: string) =>
  contraste(fg, bg) >= AA_GRANDE;
