/**
 * As peças da semana — módulo PURO.
 *
 * ── POR QUE AS PROPRIEDADES PENDEM DA PEÇA, E NÃO DO DIA ────────────────
 * Até aqui, formato e CTA eram escolhidos pelo DIA DA SEMANA
 * (`DAY_FORMAT_MAP`), e a categoria também. Isso amarra três coisas que
 * mudam em ritmos diferentes: a Pergunta da Semana é story caia onde cair,
 * mas o dia em que ela cai é justamente o que se quer testar.
 *
 * Com tudo pendendo da peça, trocar a grade passa a ser trocar UMA lista
 * (`semanal.ts`) — que é o pedido original: testar outro formato de semana
 * sem reescrever tela.
 *
 * ── O RÓTULO NARRATIVO ──────────────────────────────────────────────────
 * `abertura → tensão → mecanismo → resposta → fecho` é o arco da semana.
 * Ele prende na PEÇA, não no dia, pela mesma razão: se etapa virasse
 * sinônimo de dia, qualquer teste de formato exigiria reescrever os dois
 * juntos.
 *
 * ── ÂNCORA É SEPARADO DO RÓTULO, DE PROPÓSITO ───────────────────────────
 * Hoje a peça âncora é a mesma que carrega o rótulo `resposta`, mas os dois
 * respondem perguntas diferentes: o rótulo diz QUAL O PAPEL da peça no arco;
 * `ancora` diz QUAL PEÇA É O PRODUTO da semana. Um dia o âncora pode mudar
 * de peça sem o arco mudar — e aí um campo só teria de ser desmembrado com
 * a regra de bloqueio já dependendo dele.
 */

import type { CtaType, PostCategory, PostFormat } from "@/lib/types";

/** O arco narrativo da semana, na ordem em que se pretende que seja lido. */
export const ROTULOS = [
  "abertura",
  "tensao",
  "mecanismo",
  "resposta",
  "fecho",
] as const;

export type RotuloNarrativo = (typeof ROTULOS)[number];

export const ROTULO_LABELS: Record<RotuloNarrativo, string> = {
  abertura: "Abertura",
  tensao: "Tensão",
  mecanismo: "Mecanismo",
  resposta: "Resposta",
  fecho: "Fecho",
};

export interface Peca {
  categoria: PostCategory;
  /** Papel da peça no arco da semana. */
  rotulo: RotuloNarrativo;
  formato: PostFormat;
  cta: CtaType;
  /**
   * É o produto-âncora da semana? Exatamente uma peça é — garantido por
   * teste, porque duas âncoras tornariam a regra de bloqueio ambígua.
   */
  ancora: boolean;
}

/**
 * As cinco peças. Esta lista é a fonte; tudo em `lib/types.ts` que fala de
 * categoria/formato/CTA passa a derivar daqui.
 */
export const PECAS: readonly Peca[] = [
  {
    categoria: "onix_pratica",
    rotulo: "abertura",
    formato: "reel",
    cta: "explicito",
    ancora: false,
  },
  {
    categoria: "pergunta_semana",
    rotulo: "tensao",
    formato: "story",
    cta: "implicito",
    ancora: false,
  },
  {
    categoria: "alerta_patrimonial",
    rotulo: "mecanismo",
    formato: "carrossel",
    cta: "algoritmo",
    ancora: false,
  },
  {
    categoria: "patrimonio_mimimi",
    rotulo: "resposta",
    formato: "carrossel",
    cta: "algoritmo",
    ancora: true,
  },
  {
    categoria: "sabado_bastidores",
    rotulo: "fecho",
    formato: "reel",
    cta: "identificacao",
    ancora: false,
  },
];

const POR_CATEGORIA = new Map<PostCategory, Peca>(
  PECAS.map((p) => [p.categoria, p]),
);

export function pecaDe(categoria: PostCategory): Peca | undefined {
  return POR_CATEGORIA.get(categoria);
}

/** A peça marcada como âncora. Usada pela regra de bloqueio (PR 5). */
export function pecaAncora(): Peca {
  const ancora = PECAS.find((p) => p.ancora);
  // Impossível pelo teste que trava "exatamente uma âncora"; o throw existe
  // para o dia em que alguém editar a lista sem rodar os testes.
  if (!ancora) throw new Error("Nenhuma peça marcada como âncora em PECAS");
  return ancora;
}
