/* ──────────────────────────────────────────────────────────────
 * Perfil de importação — tipos e validação. Módulo PURO.
 *
 * ── POR QUE ESTE ARQUIVO NÃO MORA EM `lib/corretora/` ───────────────────
 * Porque o `PerfilImportacao` não é da Corretora. Ele é o mecanismo de trazer
 * planilha de fora para dentro, e a Corretora é só o primeiro a usá-lo — a
 * Imobiliária, a Corporate e a Tech vêm depois. Deixá-lo sob `corretora/`
 * convidaria o próximo a copiar em vez de reusar, e em seis meses haveria
 * quatro mapeadores divergentes.
 *
 * A régua de generalidade é literal: NENHUM identificador deste arquivo pode
 * nomear seguro, apólice, prêmio ou seguradora. Se um dia precisar, o desenho
 * está errado. Há teste afirmando isso.
 *
 * ── O MODELO MENTAL: QUATRO FORMATOS, UM MAPEAMENTO ─────────────────────
 * Excel, CSV, PDF e Word viram, todos, uma lista de CÉLULAS NOMEADAS. O que
 * muda entre eles é só COMO chegar às células — e isso é a única coisa que
 * `extracao` sabe. Passado esse ponto, o mapeamento é sempre "rótulo de
 * origem → campo de destino", igual para os quatro:
 *
 *   xlsx/csv → o nome da coluna é o rótulo
 *   docx     → a célula de cabeçalho da tabela é o rótulo
 *   pdf      → o nome do grupo de captura do regex é o rótulo
 *
 * É essa redução que faz um perfil de PDF e um de Excel terem a MESMA forma.
 * ────────────────────────────────────────────────────────────── */

/** Formatos de arquivo que o mecanismo sabe abrir. */
export const FORMATOS_ARQUIVO = ["xlsx", "csv", "pdf", "docx"] as const;
export type FormatoArquivo = (typeof FORMATOS_ARQUIVO)[number];

/**
 * Como transformar o texto bruto de uma célula em valor tipado.
 *
 * A lista é curta de propósito: cada entrada é uma AMBIGUIDADE REAL que já
 * queimou alguém. `decimal_ptbr` × `decimal_iso` existe porque "1.234,56" e
 * "1234.56" são o mesmo número com pontuação trocada, e ler um pelo outro
 * produz erro de três ordens de grandeza — silenciosamente, num campo de
 * dinheiro. `data_ddmmaaaa` × `data_iso` tem o mesmo problema: 03/04 é 3 de
 * abril ou 4 de março conforme quem gerou o arquivo.
 */
export const FORMATOS_VALOR = [
  "texto",
  "decimal_ptbr",
  "decimal_iso",
  "inteiro",
  "data_ddmmaaaa",
  "data_mmddaaaa",
  "data_iso",
  "documento_digitos",
  "booleano_sim_nao",
] as const;
export type FormatoValor = (typeof FORMATOS_VALOR)[number];

/** Como chegar às células. A forma varia por formato de arquivo. */
export type Extracao =
  | { readonly tipo: "xlsx"; readonly aba?: string; readonly linhaCabecalho?: number }
  | {
      readonly tipo: "csv";
      readonly delimitador?: string;
      readonly encoding?: string;
      readonly linhaCabecalho?: number;
    }
  | { readonly tipo: "docx"; readonly indiceTabela?: number }
  | { readonly tipo: "pdf"; readonly estrategia: "tabela"; readonly paginas?: string }
  | {
      readonly tipo: "pdf";
      readonly estrategia: "regex";
      /** rótulo → expressão com UM grupo de captura. O rótulo vira "coluna". */
      readonly padroes: Readonly<Record<string, string>>;
    };

/**
 * O conteúdo de uma linha de `PerfilImportacao`.
 *
 * `mapeamentoColunas` e `dicionarios` são `Record<string, …>` dos dois lados —
 * é isso que mantém o perfil ignorante sobre a tabela de destino. Ele não sabe
 * o que é um contrato; sabe que "Prêmio" vira o campo chamado `premio`, e quem
 * conhece `premio` é o gravador, não o perfil.
 */
export type PerfilImportacaoConfig = {
  readonly formato: FormatoArquivo;
  readonly extracao: Extracao;
  /** rótulo de origem → nome do campo canônico de destino. */
  readonly mapeamentoColunas: Readonly<Record<string, string>>;
  /** campo de destino → como parsear. Campo sem entrada aqui é `texto`. */
  readonly formatosValor: Readonly<Record<string, FormatoValor>>;
  /** campo de destino → { rótulo da fonte → valor canônico }. */
  readonly dicionarios: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

export function ehFormatoArquivo(v: string): v is FormatoArquivo {
  return (FORMATOS_ARQUIVO as readonly string[]).includes(v);
}

export function ehFormatoValor(v: string): v is FormatoValor {
  return (FORMATOS_VALOR as readonly string[]).includes(v);
}

/**
 * Confere o perfil e devolve os problemas. Lista vazia = válido.
 *
 * Devolve TODOS os problemas em vez de parar no primeiro: quem está montando
 * um perfil de 40 colunas não merece descobri-los um por deploy.
 */
export function validarPerfil(perfil: PerfilImportacaoConfig): string[] {
  const erros: string[] = [];

  if (!ehFormatoArquivo(perfil.formato)) {
    erros.push(`formato de arquivo inválido: ${JSON.stringify(perfil.formato)}`);
  }
  if (perfil.extracao.tipo !== perfil.formato) {
    erros.push(
      `extracao.tipo (${perfil.extracao.tipo}) não bate com formato (${perfil.formato})`,
    );
  }

  const destinos = new Set(Object.values(perfil.mapeamentoColunas));
  if (destinos.size === 0) {
    erros.push("mapeamentoColunas vazio — o perfil não traduz nada");
  }

  // Duas colunas de origem apontando para o mesmo destino: a segunda
  // sobrescreveria a primeira em silêncio, e o dado perdido seria o da
  // esquerda da planilha.
  const vistos = new Map<string, string>();
  for (const [origem, destino] of Object.entries(perfil.mapeamentoColunas)) {
    const anterior = vistos.get(destino);
    if (anterior !== undefined) {
      erros.push(
        `duas colunas apontam para "${destino}": ${JSON.stringify(anterior)} e ${JSON.stringify(origem)}`,
      );
    }
    vistos.set(destino, origem);
  }

  for (const [campo, formato] of Object.entries(perfil.formatosValor)) {
    if (!ehFormatoValor(formato)) {
      erros.push(`formatoValor inválido em "${campo}": ${JSON.stringify(formato)}`);
    }
    // Formato declarado para campo que o mapeamento não produz é quase sempre
    // rename esquecido de um lado só — e o sintoma seria o valor chegar como
    // texto cru, sem erro nenhum.
    if (!destinos.has(campo)) {
      erros.push(`formatosValor declara "${campo}", que mapeamentoColunas não produz`);
    }
  }

  for (const campo of Object.keys(perfil.dicionarios)) {
    if (!destinos.has(campo)) {
      erros.push(`dicionarios declara "${campo}", que mapeamentoColunas não produz`);
    }
  }

  if (perfil.extracao.tipo === "pdf" && perfil.extracao.estrategia === "regex") {
    // No PDF por regex, o nome do padrão É o rótulo de origem. Padrão sem
    // mapeamento é trabalho extraído e jogado fora.
    for (const rotulo of Object.keys(perfil.extracao.padroes)) {
      if (!(rotulo in perfil.mapeamentoColunas)) {
        erros.push(`extracao.padroes tem "${rotulo}" sem entrada em mapeamentoColunas`);
      }
    }
  }

  return erros;
}
