/**
 * Os dois regimes de publicação — módulo PURO.
 *
 * ── PLANEJADO E OPORTUNISTA ─────────────────────────────────────────────
 * `planejado` é o padrão: na semana corrente planeja-se a seguinte, e cada
 * peça ocupa o slot do seu dia na grade.
 *
 * `oportunista` é a exceção: post extra, disparado por notícia de última
 * hora, entrando no mesmo dia ou no dia seguinte. Ele é EXTRA — **nunca**
 * ocupa nem substitui o slot da peça planejada.
 *
 * ── POR QUE ISSO É UM CAMPO, E NÃO UMA DERIVAÇÃO ────────────────────────
 * A tentação é inferir o regime da distância entre `createdAt` e
 * `scheduledDate`. Não serve, por três motivos:
 *
 *   1. planejar no domingo à noite uma peça de terça daria distância de 2
 *      dias — a derivação chamaria de exceção uma peça que é da grade;
 *   2. arrastar o post muda a distância sem `createdAt` se mover, então o
 *      regime mudaria retroativamente, e voltaria ao arrastar de volta;
 *   3. a regra "oportunista não ocupa slot" precisa valer NA HORA DE
 *      GRAVAR. Valor derivado não recusa escrita: quando dá para calcular,
 *      o post já existe.
 *
 * O terceiro é o decisivo — a regra é sobre ocupação de slot, e ocupação
 * tem de ser decidível no momento em que se escreve.
 *
 * ── ESTE MÓDULO É A REGRA; O VALOR AINDA NÃO EXISTE ─────────────────────
 * A coluna `Post.regime` entra numa PR de faixa VERMELHA (migration),
 * separada e aprovada à parte. Até lá, `regimeDoPost` devolve o padrão para
 * todo post — o que faz as telas se comportarem exatamente como hoje.
 *
 * Isto é deliberado: a lógica de contagem entra revisada e testada numa PR
 * verde, e a PR vermelha fica sendo só "criar a coluna e deixar a tela
 * escrever nela". No dia em que o campo existir, nada aqui precisa mudar.
 */

export const REGIMES = ["planejado", "oportunista"] as const;

export type Regime = (typeof REGIMES)[number];

/** O regime de quem não declarou nada. Preserva o comportamento atual. */
export const REGIME_PADRAO: Regime = "planejado";

export const REGIME_LABELS: Record<Regime, string> = {
  planejado: "Planejado",
  oportunista: "Oportunista",
};

export function ehRegime(valor: unknown): valor is Regime {
  return typeof valor === "string" && (REGIMES as readonly string[]).includes(valor);
}

/**
 * O regime de um post, tolerante ao campo ainda não existir.
 *
 * Valor ausente, nulo ou desconhecido vira `planejado` — nunca lança. Um
 * dado estranho no banco não pode derrubar o calendário; no pior caso o
 * post conta como planejado, que é o comportamento de hoje.
 */
export function regimeDoPost(post: { regime?: string | null }): Regime {
  return ehRegime(post.regime) ? post.regime : REGIME_PADRAO;
}

/**
 * Este post ocupa o slot da peça na grade?
 *
 * É a única pergunta que a regra existe para responder, e é por ela que
 * passam a completude da semana, o botão de preencher e a meta de KPI.
 */
export function ocupaSlotDaGrade(post: { regime?: string | null }): boolean {
  return regimeDoPost(post) === "planejado";
}

/**
 * Filtra para as peças que ocupam slot.
 *
 * Quem conta semana usa isto, e não `posts` cru: um post oportunista com a
 * mesma categoria de uma peça planejada faria a semana parecer completa e
 * calaria o alerta que cobra a peça de verdade — que é exatamente como o
 * planejamento se desfaz sozinho em poucas semanas.
 */
export function somenteQueOcupamSlot<T extends { regime?: string | null }>(
  posts: readonly T[],
): T[] {
  return posts.filter(ocupaSlotDaGrade);
}
