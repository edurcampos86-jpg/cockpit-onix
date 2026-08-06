/**
 * Ideias parecidas já ENTREGUES, para dar contexto histórico ao RICE da IA.
 *
 * O problema concreto: `sugerir-rice` monta o prompt olhando só para a linha
 * atual. Com a fila crescendo, variações da mesma ideia chegam à IA como se
 * fossem inéditas, e ela devolve uma `confidence` que não sabe que aquilo já
 * foi feito — ou já foi estimado e custou o triplo.
 *
 * Similaridade por sobreposição de tokens, não por embedding: o custo de um
 * modelo de embedding (chave, latência, armazenamento de vetores) não se paga
 * numa fila desta ordem de grandeza, e o objetivo aqui é modesto — puxar 3
 * candidatos plausíveis para o prompt, não ranquear com precisão. A IA lê os 3
 * e decide o que fazer com eles.
 *
 * Módulo puro: sem Prisma, sem rede. Recebe as linhas e devolve as melhores.
 */

export type CandidataSimilar = {
  oQue: string;
  prNumero: number | null;
  /** Dias entre criação e merge; null quando não dá para calcular. */
  leadTimeDias: number | null;
  effort: number | null;
};

export type LinhaEntregue = {
  oQue: string;
  effort: number | null;
  prNumero: number | null;
  createdAt: Date;
  prMergedAt: Date | null;
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Palavras curtas e conectivos não distinguem nada e inflam a sobreposição:
 * "de", "para", "que" aparecem em toda sugestão. Sem esta lista, duas ideias
 * sem nada em comum pontuam alto só por serem escritas em português.
 */
const STOPWORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e",
  "em", "na", "nas", "no", "nos", "o", "os", "ou", "para", "pelo", "pela",
  "por", "que", "se", "sem", "um", "uma", "uns", "umas", "the", "of",
]);

/** Minúsculas, sem acento, só palavras de 3+ letras que não sejam stopword. */
export function tokenizar(texto: string): Set<string> {
  const limpo = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const palavras = limpo.match(/[a-z0-9]+/g) ?? [];
  return new Set(
    palavras.filter((p) => p.length >= 3 && !STOPWORDS.has(p)),
  );
}

/**
 * Jaccard: interseção sobre união. Escolhido em vez de "quantas palavras em
 * comum" porque a contagem crua premia texto longo — uma sugestão de 3 linhas
 * casaria com tudo só por ter mais palavras para sortear.
 */
export function similaridade(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comuns = 0;
  for (const t of a) if (b.has(t)) comuns++;
  const uniao = a.size + b.size - comuns;
  return uniao === 0 ? 0 : comuns / uniao;
}

/**
 * Piso de similaridade. Abaixo disto o "parecido" é ruído, e enfiar ruído no
 * prompt é pior que não mandar nada: a IA trata como evidência.
 */
const PISO = 0.12;

export function buscarSimilares(
  alvo: string,
  entregues: readonly LinhaEntregue[],
  limite = 3,
): CandidataSimilar[] {
  const tAlvo = tokenizar(alvo);
  if (tAlvo.size === 0) return [];

  return entregues
    .map((e) => ({ e, s: similaridade(tAlvo, tokenizar(e.oQue)) }))
    .filter((x) => x.s >= PISO)
    .sort((a, b) => b.s - a.s)
    .slice(0, limite)
    .map(({ e }) => ({
      oQue: e.oQue,
      prNumero: e.prNumero,
      effort: e.effort,
      leadTimeDias:
        e.prMergedAt && e.prMergedAt >= e.createdAt
          ? Math.round(
              (e.prMergedAt.getTime() - e.createdAt.getTime()) / MS_POR_DIA,
            )
          : null,
    }));
}

/** Bloco de texto para o prompt. String vazia quando não há candidata. */
export function textoSimilares(similares: readonly CandidataSimilar[]): string {
  if (similares.length === 0) return "";
  const linhas = similares.map((s) => {
    const partes = [`- "${s.oQue}"`];
    if (s.effort != null) partes.push(`effort estimado ${s.effort}`);
    if (s.leadTimeDias != null) partes.push(`entregue em ${s.leadTimeDias} dias`);
    if (s.prNumero != null) partes.push(`PR #${s.prNumero}`);
    return partes.join(" · ");
  });
  return [
    "",
    "Ideias PARECIDAS que já foram entregues (use para calibrar effort e confidence — se esta sugestão for uma variação de algo já feito, diga isso na justificativa):",
    ...linhas,
  ].join("\n");
}
