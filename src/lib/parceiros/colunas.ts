/* ──────────────────────────────────────────────────────────────
 * Colunas da lista de Parceiros — módulo PURO.
 *
 * ── POR QUE A COLUNA DE COMISSÃO NASCE INVISÍVEL, E MESMO ASSIM EXISTE ───
 * O percentual do acordo já está no banco desde a #318. O que NÃO existe é a
 * BASE sobre a qual ele incide: `AcordoComercialParceiro.percentual` guarda
 * "20" e nenhuma coluna diz "20% de quê". O acordo real é sobre receita
 * líquida, e isso hoje vive só na conversa — o Financeiro ainda vai decidir.
 *
 * Mostrar "R$ ..." antes dessa decisão seria pior que não mostrar: o número
 * apareceria certo, seria lido como oficial, e mudaria de valor quando a base
 * fosse definida.
 *
 * Então a coluna existe no layout e não pinta conteúdo: `visivel: false` com
 * `largura` declarada. A tabela emite `<col>` para TODAS as colunas, inclusive
 * as invisíveis — quando o Financeiro fechar a base, ligar a coluna não
 * empurra nenhuma outra de lugar, porque o espaço já era dela.
 * ────────────────────────────────────────────────────────────── */

export type ColunaParceiro = {
  chave: string;
  rotulo: string;
  /** Largura reservada no `<colgroup>`. Vale mesmo com `visivel: false`. */
  largura: string;
  visivel: boolean;
  /** Alinhamento do conteúdo; números alinham à direita. */
  alinhamento?: "esquerda" | "direita";
  /** Por que está oculta. Obrigatório para coluna invisível — ver o teste. */
  motivoOculta?: string;
};

export const COLUNAS_PARCEIROS: readonly ColunaParceiro[] = [
  { chave: "nome", rotulo: "Parceiro", largura: "auto", visivel: true },
  { chave: "tipo", rotulo: "Relação", largura: "9rem", visivel: true },
  { chave: "contrato", rotulo: "Contrato", largura: "10rem", visivel: true },
  {
    chave: "clientes",
    rotulo: "Clientes",
    largura: "7rem",
    visivel: true,
    alinhamento: "direita",
  },
  {
    chave: "acordos",
    rotulo: "Acordos",
    largura: "7rem",
    visivel: true,
    alinhamento: "direita",
  },
  {
    chave: "comissao",
    rotulo: "Comissão",
    largura: "9rem",
    visivel: false,
    alinhamento: "direita",
    motivoOculta:
      "A base do percentual (receita líquida?) ainda não existe no banco — ver o comentário do módulo.",
  },
] as const;

export const colunasVisiveis = (colunas = COLUNAS_PARCEIROS) =>
  colunas.filter((c) => c.visivel);

/** Quantas colunas a tabela ocupa de fato — para `colSpan` do estado vazio. */
export const totalColunasVisiveis = (colunas = COLUNAS_PARCEIROS) =>
  colunasVisiveis(colunas).length;
