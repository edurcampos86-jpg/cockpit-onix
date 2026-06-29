/**
 * Tipos compartilhados do CONTEÚDO dos campos Json de `ReuniaoEstruturada`.
 *
 * O schema Prisma guarda `pautas` / `pendencias` / `proximosPassos` como `Json?`
 * (livre no banco). Estes tipos são o contrato validado NA APLICAÇÃO — a Server
 * Action `criarReuniaoEstruturada` coage o input do formulário para estas formas
 * antes de gravar, e a leitura (cockpit-reuniao-tab) interpreta de volta.
 *
 * `ItemAcionavel` espelha o shape de `ProximoPasso` de ReuniaoTime
 * (`{ texto, concluido, concluidoEm }`) para que pendências e próximos passos
 * possam, no futuro, ser marcados como concluídos sem mudar o shape gravado.
 */

/** Item que pode ser marcado como concluído (pendência ou próximo passo). */
export type ItemAcionavel = {
  texto: string;
  concluido: boolean;
  concluidoEm: string | null; // ISO; null enquanto aberto
};

/** Um tópico de pauta da reunião. */
export type PautaItem = { texto: string };

/** Lista de pautas da reunião. */
export type ReuniaoPautas = PautaItem[];

/** Pendências separadas por lado (quem deve a ação). */
export type ReuniaoPendencias = {
  assessor: ItemAcionavel[];
  cliente: ItemAcionavel[];
};

/** Próximos passos acordados na reunião. */
export type ReuniaoProximosPassos = ItemAcionavel[];

/**
 * Foto do patrimônio declarado na reunião (campo `patrimonioSnapshot` Json?).
 * Totais em REAIS CHEIOS, inteiro (ex.: 4000000 = R$ 4 mi) — mesma unidade que a
 * extração pede à IA. Todos opcionais: a IA preenche só o que o resumo trouxer;
 * `moeda` é fixa em "BRL" no contexto Onix.
 */
export type PatrimonioSnapshot = {
  totalBtg?: number; // em reais cheios, inteiro (ex.: 4000000)
  totalForaBtg?: number; // em reais cheios, inteiro (ex.: 4000000)
  totalGeral?: number; // em reais cheios, inteiro (ex.: 4000000)
  moeda: "BRL";
  observacao?: string;
};

/** Cadências válidas (whitelist do `tipoCadencia`). */
export const CADENCIAS_REUNIAO = [
  { value: "primeira", label: "Primeira reunião" },
  { value: "trimestral", label: "Trimestral" },
  { value: "revisao-anual", label: "Revisão anual" },
  { value: "extraordinaria", label: "Extraordinária" },
  { value: "outra", label: "Outra" },
] as const;

export type TipoCadencia = (typeof CADENCIAS_REUNIAO)[number]["value"];

/** Rótulo legível de uma cadência (ou a própria string se desconhecida). */
export function rotuloCadencia(value: string | null | undefined): string | null {
  if (!value) return null;
  return CADENCIAS_REUNIAO.find((c) => c.value === value)?.label ?? value;
}

// ============================================================================
// EXTRAÇÃO RICA (Fase 1b-2a) — shapes que a IA produz e o preview edita.
// NÃO são (ainda) colunas/Json de ReuniaoEstruturada: nesta fase só trafegam
// na resposta da extração e no preview. O destino durável dos fatos é
// ClienteFato (Fase 1b-2b). Taxonomia: IDENTIDADE | FAMILIA | PROJETO |
// METRICA | MEMORAVEL | SAUDE | SUCESSAO.
// ============================================================================

/** Identidade do PRÓPRIO cliente. Todos opcionais (só o que o resumo trouxer). */
export type IdentidadeExtraida = {
  idade?: number; // anos
  profissao?: string;
  origem?: string;
  estadoCivil?: string;
};

/** Pessoa do círculo do cliente (cônjuge, filho, pai, sócio pessoal). */
export type FamiliaEntidade = {
  chave: string; // estável, ex.: "familia:gustavo"
  nome: string;
  resumo: string;
  detalhe?: string;
  sensivel: boolean; // saúde/dado sensível de TERCEIRO entra aqui (R2)
};

/** Horizonte temporal de um projeto. */
export type HorizonteProjeto = "curto" | "medio" | "longo";

/** Horizontes válidos (whitelist + rótulo para o select do preview). */
export const HORIZONTES_PROJETO = [
  { value: "curto", label: "Curto (até 1 ano)" },
  { value: "medio", label: "Médio (1–5 anos)" },
  { value: "longo", label: "Longo (5+ anos)" },
] as const;

/** Projeto / objetivo de vida do cliente. */
export type ProjetoEntidade = {
  chave: string; // ex.: "projeto:vender-itacimirim"
  descricao: string;
  horizonte: HorizonteProjeto;
};

/**
 * Métrica de FLUXO (despesa/renda/poupança). Decisão 16: numérica OU
 * qualitativa — `valorNumerico` (reais cheios) quando o texto der número,
 * senão `valorTexto`. Patrimônio NÃO entra aqui (vai no PatrimonioSnapshot/1a).
 */
export type MetricaEntidade = {
  chave: string; // ex.: "despesaMensal" | "rendaMensal" | "capacidadePoupanca"
  valorNumerico?: number; // reais cheios, inteiro
  valorTexto?: string; // qualitativo, ex.: "muito alta"
};

/** Fato memorável (aniversário, hobby, data marcante, preferência). */
export type MemoravelEntidade = {
  chave: string; // ex.: "memoravel:aniversario"
  descricao: string;
  vence?: string | null; // ISO yyyy-mm-dd quando tem prazo; null se não vence
};

/** Sinal de sucessão / proteção patrimonial / cross-sell. */
export type SucessaoEntidade = {
  chave: string; // ex.: "produto:seguro-vida" | "risco:inventario"
  descricao: string;
};

/** Bloco rico completo devolvido pela extração (1b-2a). */
export type ExtracaoRica = {
  identidade: IdentidadeExtraida;
  familia: FamiliaEntidade[];
  projetos: ProjetoEntidade[];
  metricas: MetricaEntidade[];
  memoraveis: MemoravelEntidade[];
  saude: string; // saúde do PRÓPRIO cliente; "" se não houver
  sucessao: SucessaoEntidade[];
};
