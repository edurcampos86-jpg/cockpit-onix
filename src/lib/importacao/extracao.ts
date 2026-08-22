/* ──────────────────────────────────────────────────────────────
 * Extração — a interface única. Arquivo entra, linhas normalizadas saem.
 *
 * ── O PONTO DO ARQUIVO ──────────────────────────────────────────────────
 * Os quatro formatos devolvem a MESMA forma: uma lista de linhas, cada linha
 * um mapa "rótulo de origem → texto cru". Tudo depois daqui (perfil, casamento,
 * gravação) ignora se o dado veio de Excel ou de PDF. Sem essa redução, cada
 * formato novo viraria um caminho paralelo de gravação — e o quarto deles
 * gravaria diferente dos três primeiros sem ninguém perceber.
 *
 * ── A REGRA QUE O DESPACHO IMPÕE ────────────────────────────────────────
 * Excel e CSV são DETERMINÍSTICOS. Nunca passam por IA. Não é preferência de
 * custo: planilha tem estrutura declarada, e mandá-la para um modelo troca uma
 * leitura exata por uma leitura provável. O `switch` abaixo é o lugar onde essa
 * regra vive, e o módulo de IA só é carregado (import dinâmico) nos dois ramos
 * que podem usá-lo — quem lê planilha nem toca no SDK.
 *
 * A `origem` fica gravada em CADA linha, não no arquivo: um dia um formato
 * híbrido vai existir, e a auditoria precisa responder "esta linha aqui, veio
 * de onde?" sem inferir pelo nome do arquivo.
 * ────────────────────────────────────────────────────────────── */

import type { FormatoArquivo, PerfilImportacaoConfig } from "./perfil";

/** De onde saiu a linha. Auditabilidade: fica em cada linha, não no arquivo. */
export type OrigemExtracao = "deterministica" | "ia";

/** Uma linha bruta: rótulos de origem apontando para texto ainda não tipado. */
export type LinhaExtraida = {
  /** 1-based, para o relatório citar "linha 47" e a pessoa achar na planilha. */
  readonly numero: number;
  readonly celulas: Readonly<Record<string, string>>;
  readonly origem: OrigemExtracao;
};

/**
 * Custo da extração por IA, em dólar, medido — não estimado.
 *
 * `null` no resultado significa extração determinística: custo zero, e essa é
 * a diferença que justifica a regra do despacho.
 */
export type CustoExtracao = {
  readonly modelo: string;
  readonly tokensEntrada: number;
  readonly tokensSaida: number;
  readonly usd: number;
};

export type ResultadoExtracao = {
  readonly formato: FormatoArquivo;
  readonly arquivo: string;
  readonly linhas: readonly LinhaExtraida[];
  readonly custo: CustoExtracao | null;
  /** O que o leitor achou estranho mas não impediu a leitura. */
  readonly avisos: readonly string[];
};

export type ArquivoEntrada = {
  readonly nome: string;
  readonly conteudo: Buffer;
};

/**
 * O que o caminho de IA precisa e o determinístico ignora.
 *
 * A chave entra por parâmetro em vez de ser lida aqui dentro para que o módulo
 * continue sem I/O de configuração — e para que o caminho de planilha rode em
 * teste sem nenhuma credencial no ambiente.
 */
export type OpcoesExtracao = {
  readonly apiKey?: string;
  readonly modelo?: string;
};

/** Formatos que JAMAIS podem passar por IA. Lida pelo despacho e pelo teste. */
export const FORMATOS_DETERMINISTICOS: readonly FormatoArquivo[] = ["xlsx", "csv"];

/** Formatos que a IA lê — e só eles. */
export const FORMATOS_IA: readonly FormatoArquivo[] = ["pdf", "docx"];

export function usaIa(formato: FormatoArquivo): boolean {
  return FORMATOS_IA.includes(formato);
}

/**
 * Lê o arquivo segundo o perfil e devolve linhas cruas.
 *
 * Não aplica mapeamento, não converte valor, não conhece contrato: isso é
 * `aplicarPerfil`. Aqui só se resolve COMO chegar às células.
 */
export async function extrair(
  arquivo: ArquivoEntrada,
  perfil: PerfilImportacaoConfig,
  opcoes: OpcoesExtracao = {},
): Promise<ResultadoExtracao> {
  switch (perfil.formato) {
    case "xlsx":
    case "csv": {
      // Import estático seria igualmente correto; o dinâmico deixa explícito
      // que o caminho determinístico não carrega o SDK de IA.
      const { extrairPlanilha } = await import("./extracao-planilha");
      return extrairPlanilha(arquivo, perfil);
    }
    case "pdf":
    case "docx": {
      const { extrairPorIa } = await import("./extracao-ia");
      return extrairPorIa(arquivo, perfil, opcoes);
    }
    default:
      throw new Error(`formato de arquivo não suportado: ${JSON.stringify(perfil.formato)}`);
  }
}
