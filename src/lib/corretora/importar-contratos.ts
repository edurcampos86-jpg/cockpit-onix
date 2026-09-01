/* ──────────────────────────────────────────────────────────────
 * Planejamento do import de contratos da Corretora. Módulo PURO — nenhuma
 * chamada de banco aqui dentro. O executor pergunta ao banco, entrega o estado
 * atual, recebe o plano e grava.
 *
 * Separar assim tem um motivo prático: TODA a regra que pode destruir dado
 * (casamento, idempotência, preservação de histórico) fica testável sem banco,
 * e o dry-run e o "aplicar" rodam exatamente o MESMO cálculo. Se o dry-run
 * usasse um caminho e a aplicação outro, o número que o Eduardo aprova não
 * seria o número que executa.
 *
 * ── AS QUATRO REGRAS QUE ESTE ARQUIVO EXISTE PARA GARANTIR ──────────────
 *
 * 1. CASAMENTO SÓ POR DOCUMENTO. `cpfCnpj` normalizado, CPF com CPF e CNPJ com
 *    CNPJ. Nunca por nome, e-mail ou telefone. Dois "João da Silva" existem; um
 *    casamento por nome funde duas carteiras de clientes diferentes, e o
 *    estrago só aparece quando alguém liga para o cliente errado.
 *
 * 2. PESSOA SEM VÍNCULO É CRIADA. A Corretora tem cliente EXCLUSIVO dela — quem
 *    nunca abriu conta no BTG. Pular essas linhas jogaria fora metade da base.
 *
 * 3. IDEMPOTÊNCIA POR CHAVE DE NEGÓCIO — (parceiro, numeroContrato,
 *    tipoProduto) — e não por linha de arquivo. A corretora reenvia a mesma
 *    carteira todo mês com uma coluna a mais; por linha, o segundo envio
 *    duplicaria a base inteira.
 *
 * 4. HISTÓRICO NÃO ANDA PARA TRÁS. Contrato cancelado, encerrado ou recusado
 *    é estado TERMINAL: um arquivo antigo reprocessado não o traz de volta
 *    para `ativo`. Churn reconstruído para trás é churn perdido.
 *
 * 5. VALOR TAMBÉM NÃO ANDA PARA TRÁS. A regra 4 protegia só o `status`, e o
 *    ensaio mostrou o buraco: rodado setembro (prêmio 1.400), reprocessar o
 *    arquivo de agosto devolvia 1.234,56 — sem erro, sem aviso, sem ninguém
 *    saber. É a mesma inversão de precedência que o `upsertPorPolitica` do BTG
 *    já documenta.
 *
 *    Agora cada lote declara sua COMPETÊNCIA (`dataReferencia`) e a gravação só
 *    acontece se ela for MAIOR OU IGUAL à do registro gravado. Igual atualiza —
 *    reprocessar o mesmo relatório é correção, não regressão. Menor é ignorado,
 *    COM MOTIVO no relatório, e o arquivo antigo segue CRIANDO o que falta: ele
 *    tem direito de completar a base, não de reescrevê-la.
 * ────────────────────────────────────────────────────────────── */

import type { LinhaAplicada, ValorCanonico } from "@/lib/importacao/aplicar-perfil";
import type { OrigemExtracao } from "@/lib/importacao/extracao";
import { ehTipoProdutoValido, normalizarRotulo, resolverFamilia } from "./catalogo-produtos";
import { ehStatusValido } from "./status-contrato";

/** Status a partir dos quais o contrato não volta. Ver regra 4. */
export const STATUS_TERMINAIS: readonly string[] = ["cancelado", "encerrado", "recusado"];

export function ehTerminal(status: string): boolean {
  return STATUS_TERMINAIS.includes(status);
}

/**
 * As colunas OPCIONAIS de `ContratoCorretora` que um relatório pode preencher.
 *
 * São exatamente as que somem quando o perfil não mapeia a coluna — e por isso
 * são as únicas que precisam da distinção entre "veio vazio" e "não veio".
 * `tipoProduto`, `status`, `parceiro`, `numeroContrato` e `inicioVigencia`
 * ficam de fora porque `montarRegistro` REJEITA a linha sem elas: não existe
 * registro em que estejam ausentes.
 */
export const CAMPOS_SOBRESCREVIVEIS: readonly string[] = [
  "fimVigencia",
  "premio",
  "comissao",
  "atendenteCorretora",
  "assessorCge",
];

/** O registro que vira (ou atualiza) uma linha de `ContratoCorretora`. */
export type RegistroContrato = {
  readonly cpfCnpj: string;
  readonly nome: string | null;
  readonly tipoProduto: string;
  readonly parceiro: string;
  readonly numeroContrato: string;
  readonly inicioVigencia: Date;
  readonly fimVigencia: Date | null;
  readonly status: string;
  readonly premio: number | null;
  readonly comissao: number | null;
  readonly atendenteCorretora: string | null;
  readonly assessorCge: string | null;
  /** Tudo que o perfil trouxe e o model não tem coluna para guardar. */
  readonly dadosProduto: Readonly<Record<string, unknown>>;
  /**
   * Os campos de destino que este relatório REALMENTE trouxe.
   *
   * É a distinção que faltava, e sem ela o motor apagava dado em silêncio:
   * `fimVigencia: null` significava as duas coisas ao mesmo tempo — "a célula
   * veio vazia" e "o perfil não mapeia essa coluna". A primeira é uma
   * afirmação da fonte e pode gravar null; a segunda é AUSÊNCIA DE
   * INFORMAÇÃO, e escrever null a partir dela é inventar um fato.
   *
   * O efeito era pior do que parece: `fimVigencia` é o campo que diz quando
   * ligar para o cliente. Um perfil que não mapeasse a coluna zerava a data de
   * todo contrato que atualizasse — e o cliente vencia sem ninguém ligar.
   *
   * Vem de `Object.keys(linha.campos)`, que por construção
   * (`aplicar-perfil.ts:84-115`) só tem chave para coluna que o perfil mapeia
   * E que existe no arquivo. Array e não Set porque o plano é serializado.
   */
  readonly camposDoRelatorio: readonly string[];
  readonly linhaOrigem: number;
  readonly origemExtracao: OrigemExtracao;
  /**
   * COMPETÊNCIA do relatório que originou a linha — não o instante do import.
   *
   * A distinção é o ponto todo da regra 5: "quando o arquivo foi processado"
   * responde sempre "agora", e agora é sempre o mais novo, o que devolveria
   * exatamente o bug. "De que mês é este relatório" é a única pergunta que
   * ordena dois arquivos entre si.
   */
  readonly dataReferencia: Date;
};

export type LinhaRejeitada = {
  readonly numero: number;
  readonly motivo: string;
};

/** O que o executor precisa ter perguntado ao banco ANTES de planejar. */
export type EstadoAtual = {
  /** documento normalizado → id de `PessoaGrupo`. */
  readonly pessoasPorDocumento: ReadonlyMap<string, string>;
  /** chave de negócio → contrato existente. */
  readonly contratosPorChave: ReadonlyMap<
    string,
    {
      readonly id: string;
      readonly status: string;
      /**
       * Competência do lote que gravou este registro. `null` em contrato
       * cadastrado à mão ou importado antes desta regra existir — e `null`
       * NÃO bloqueia: sem referência gravada não há como afirmar que a do
       * arquivo é mais velha, e recusar por dúvida travaria a primeira
       * importação de toda base existente.
       */
      readonly dataReferencia: Date | null;
      /**
       * Quais dos `CAMPOS_SOBRESCREVIVEIS` já têm valor gravado nesta linha.
       *
       * Serve a UMA pergunta, e é a que o ensaio não sabia responder: quantos
       * valores a base tem hoje que este perfil não cobre. Antes da trava,
       * esses valores eram apagados; depois dela, são preservados — mas o
       * operador continua precisando saber que o perfil está incompleto,
       * senão a preservação vira silêncio no lugar do estrago.
       */
      readonly preenchidos: readonly string[];
    }
  >;
};

export type AcaoContrato =
  | { readonly acao: "criar"; readonly chave: string; readonly registro: RegistroContrato }
  | {
      readonly acao: "atualizar";
      readonly chave: string;
      readonly id: string;
      readonly registro: RegistroContrato;
    };

/** Uma grafia de atendente, como ela aparece nos arquivos. */
export type GrafiaAtendente = {
  /** A forma normalizada — é ela que junta "Ana Paula" e "ANA  PAULA". */
  readonly normalizado: string;
  /** As grafias literais que caíram nessa forma. */
  readonly grafias: readonly string[];
  readonly linhas: number;
};

export type Plano = {
  readonly linhasLidas: number;
  readonly rejeitadas: readonly LinhaRejeitada[];
  /**
   * Linhas com ao menos um rótulo sem mapeamento. É um SUBCONJUNTO de
   * `rejeitadas`, contado à parte porque é o único motivo de rejeição que se
   * resolve editando o perfil, sem tocar no arquivo da corretora.
   */
  readonly pendentes: number;
  /** Documentos sem `PessoaGrupo` hoje — serão CRIADOS. */
  readonly pessoasACriar: readonly { readonly cpfCnpj: string; readonly nome: string | null }[];
  readonly pessoasCasadas: number;
  readonly acoes: readonly AcaoContrato[];
  /** Atualizações recusadas pela regra 4, com o estado que foi preservado. */
  readonly historicoPreservado: readonly {
    readonly chave: string;
    readonly statusAtual: string;
    readonly statusRecusado: string;
    readonly linha: number;
  }[];
  /** Linhas repetidas dentro do MESMO lote, com a chave que já tinha aparecido. */
  readonly duplicadasNoLote: readonly { readonly linha: number; readonly chave: string }[];
  /**
   * Regra 5: linhas de um relatório MAIS ANTIGO que o registro gravado.
   *
   * Sai no relatório com as duas datas porque o número sozinho não decide
   * nada — "12 linhas ignoradas" pode ser o comportamento certo (alguém
   * reprocessou março por engano) ou o sintoma de uma competência informada
   * errada no lote, e só as datas lado a lado distinguem os dois casos.
   */
  readonly ignoradasPorAntiguidade: readonly {
    readonly chave: string;
    readonly linha: number;
    readonly referenciaDoLote: Date;
    readonly referenciaGravada: Date;
  }[];
  readonly grafiasAtendente: readonly GrafiaAtendente[];
  /**
   * Campos que a base tem preenchidos e que ESTE perfil não traz, por campo.
   *
   * Não é uma lista de estrago: desde a trava, esses valores são PRESERVADOS.
   * É o diagnóstico de perfil incompleto — "a base tem 107 fins de vigência e
   * o seu relatório não traz essa coluna" —, que é a informação que faz
   * alguém corrigir o mapeamento em vez de descobrir o buraco meses depois.
   *
   * Só conta contratos que este lote realmente atualizaria: campo não coberto
   * num contrato que o lote nem toca não é notícia.
   */
  readonly camposNaoCobertos: readonly { readonly campo: string; readonly contratos: number }[];
};

/**
 * A chave de negócio. Normalizada dos três lados: a corretora escreve
 * "AP-001234" num mês e "ap 001234" no outro, e é o MESMO contrato.
 */
export function chaveNegocio(r: {
  parceiro: string;
  numeroContrato: string;
  tipoProduto: string;
}): string {
  return [
    normalizarRotulo(r.parceiro),
    normalizarRotulo(r.numeroContrato),
    r.tipoProduto,
  ].join("|");
}

function texto(v: ValorCanonico): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numero(v: ValorCanonico): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function data(v: ValorCanonico): Date | null {
  return v instanceof Date ? v : null;
}

/** Campos que o model tem coluna para guardar. O resto vai em `dadosProduto`. */
const CAMPOS_COM_COLUNA = new Set([
  "cpfCnpj",
  "nome",
  "tipoProduto",
  "parceiro",
  "numeroContrato",
  "inicioVigencia",
  "fimVigencia",
  "status",
  "premio",
  "comissao",
  "atendenteCorretora",
  "assessorCge",
  // Não é coluna própria — vai para `importadoEm`. Está aqui para NÃO vazar
  // duplicada dentro de `dadosProduto`.
  "dataReferencia",
]);

/**
 * Converte uma linha aplicada em registro, ou diz por que ela não vira.
 *
 * ── A PRECEDÊNCIA DE VOCABULÁRIO, QUE VALE A PENA LER DEVAGAR ──────────
 * Perfil SEM dicionário de `tipoProduto`: valem os aliases de mercado do
 * catálogo ("Consórcio" → `consorcio`), que são lista curada e casamento
 * exato — não semelhança.
 *
 * Perfil COM dicionário de `tipoProduto`: ele é AUTORITATIVO, e rótulo fora
 * dele fica pendente mesmo que o catálogo o conhecesse. Parece severo, e é de
 * propósito: quem declarou o vocabulário da fonte respondeu pelo vocabulário
 * INTEIRO dela, e completar por fora traria de volta, pela porta dos fundos, o
 * encaixe que a regra do pendente existe para impedir. O custo é uma linha no
 * dicionário; o diagnóstico já diz qual.
 *
 * ── DE ONDE VEM A COMPETÊNCIA ───────────────────────────────────────────
 * Do arquivo, se o perfil mapear uma coluna para `dataReferencia`; senão, do
 * valor declarado para o lote inteiro. Coluna vence, porque um arquivo que traz
 * a própria competência sabe mais do que quem digitou a do lote — e um relatório
 * com meses misturados é justamente o caso em que o valor do lote mentiria.
 *
 * Sem nenhum dos dois a linha é REJEITADA, não estimada. Chutar "hoje" aqui
 * reintroduziria o bug inteiro: hoje é sempre o mais recente.
 */
export function montarRegistro(
  linha: LinhaAplicada,
  parceiroPadrao: string,
  dicionarioProduto?: Readonly<Record<string, string>>,
  dataReferenciaDoLote?: Date,
): { ok: true; registro: RegistroContrato } | { ok: false; motivo: string } {
  if (linha.erros.length > 0) return { ok: false, motivo: linha.erros.join("; ") };

  const pendentes = Object.entries(linha.pendentes);
  if (pendentes.length > 0) {
    return {
      ok: false,
      motivo: pendentes.map(([campo, rot]) => `${campo} sem mapeamento: ${JSON.stringify(rot)}`).join("; "),
    };
  }

  const c = linha.campos;

  const cpfCnpj = texto(c.cpfCnpj);
  if (!cpfCnpj) return { ok: false, motivo: "sem cpfCnpj — casamento só existe por documento" };
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
    return { ok: false, motivo: `cpfCnpj com ${cpfCnpj.length} dígitos (esperado 11 ou 14)` };
  }

  const rotuloProduto = texto(c.tipoProduto);
  if (!rotuloProduto) return { ok: false, motivo: "sem tipoProduto" };
  // Se o dicionário do perfil já resolveu, `rotuloProduto` chega canônico e
  // `resolverFamilia` o reconhece pelo próprio id. Se não resolveu, tenta o
  // alias de mercado. Se nenhum dos dois, é `null` — e null vira rejeição.
  const tipoProduto = resolverFamilia(rotuloProduto, dicionarioProduto);
  if (!tipoProduto || !ehTipoProdutoValido(tipoProduto)) {
    return { ok: false, motivo: `tipoProduto sem mapeamento: ${JSON.stringify(rotuloProduto)}` };
  }

  const status = texto(c.status);
  if (!status) return { ok: false, motivo: "sem status" };
  if (!ehStatusValido(status)) {
    return { ok: false, motivo: `status sem mapeamento: ${JSON.stringify(status)}` };
  }

  const numeroContrato = texto(c.numeroContrato);
  if (!numeroContrato) return { ok: false, motivo: "sem numeroContrato — a chave de negócio depende dele" };

  const inicioVigencia = data(c.inicioVigencia);
  if (!inicioVigencia) return { ok: false, motivo: "sem inicioVigencia válida" };

  const parceiro = texto(c.parceiro) ?? parceiroPadrao;
  if (!parceiro) return { ok: false, motivo: "sem parceiro — a chave de negócio depende dele" };

  const dataReferencia = data(c.dataReferencia) ?? dataReferenciaDoLote ?? null;
  if (!dataReferencia) {
    return {
      ok: false,
      motivo:
        "sem dataReferencia — mapeie a coluna de competência no perfil ou informe a do lote",
    };
  }

  const dadosProduto: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(c)) {
    if (CAMPOS_COM_COLUNA.has(campo)) continue;
    dadosProduto[campo] = valor instanceof Date ? valor.toISOString() : valor;
  }

  return {
    ok: true,
    registro: {
      cpfCnpj,
      nome: texto(c.nome),
      tipoProduto,
      parceiro,
      numeroContrato,
      inicioVigencia,
      fimVigencia: data(c.fimVigencia),
      status,
      premio: numero(c.premio),
      comissao: numero(c.comissao),
      atendenteCorretora: texto(c.atendenteCorretora),
      assessorCge: texto(c.assessorCge),
      dadosProduto,
      camposDoRelatorio: Object.keys(c).sort(),
      linhaOrigem: linha.numero,
      origemExtracao: linha.origem,
      dataReferencia,
    },
  };
}

/**
 * Diagnóstico de grafia de atendente.
 *
 * Não muda nada e não corrige nada — só CONTA. A pergunta que ele responde é
 * se `atendenteCorretora` deve um dia virar FK: se as 40 grafias colapsam em 6
 * pessoas, o campo texto está sangrando; se são 38 pessoas de verdade, não há
 * problema a resolver. Decidir isso antes de medir seria adivinhação.
 */
export function diagnosticarGrafias(
  registros: readonly RegistroContrato[],
): GrafiaAtendente[] {
  const mapa = new Map<string, { grafias: Set<string>; linhas: number }>();
  for (const r of registros) {
    if (!r.atendenteCorretora) continue;
    const chave = normalizarRotulo(r.atendenteCorretora);
    if (chave === "") continue;
    const atual = mapa.get(chave) ?? { grafias: new Set<string>(), linhas: 0 };
    atual.grafias.add(r.atendenteCorretora);
    atual.linhas += 1;
    mapa.set(chave, atual);
  }
  return [...mapa.entries()]
    .map(([normalizado, v]) => ({
      normalizado,
      grafias: [...v.grafias].sort(),
      linhas: v.linhas,
    }))
    .sort((a, b) => b.linhas - a.linhas || a.normalizado.localeCompare(b.normalizado));
}

/**
 * O plano. Mesma função para o dry-run e para o "aplicar" — a diferença entre
 * os dois está em EXECUTAR o plano, não em calculá-lo.
 */
export function planejar(
  linhas: readonly LinhaAplicada[],
  estado: EstadoAtual,
  opcoes: {
    readonly parceiroPadrao: string;
    readonly dicionarioProduto?: Readonly<Record<string, string>>;
    /** Competência do lote. Ignorada nas linhas cujo perfil traz a própria. */
    readonly dataReferenciaDoLote?: Date;
  },
): Plano {
  const rejeitadas: LinhaRejeitada[] = [];
  const registros: RegistroContrato[] = [];
  let pendentes = 0;

  for (const linha of linhas) {
    if (Object.keys(linha.pendentes).length > 0) pendentes += 1;
    const r = montarRegistro(
      linha,
      opcoes.parceiroPadrao,
      opcoes.dicionarioProduto,
      opcoes.dataReferenciaDoLote,
    );
    if (!r.ok) {
      rejeitadas.push({ numero: linha.numero, motivo: r.motivo });
      continue;
    }
    registros.push(r.registro);
  }

  const documentosNovos = new Map<string, string | null>();
  let pessoasCasadas = 0;
  const documentosCasados = new Set<string>();
  for (const r of registros) {
    if (estado.pessoasPorDocumento.has(r.cpfCnpj)) {
      if (!documentosCasados.has(r.cpfCnpj)) {
        documentosCasados.add(r.cpfCnpj);
        pessoasCasadas += 1;
      }
      continue;
    }
    // Regra 2: cliente exclusivo da Corretora entra. Uma vez por documento,
    // ainda que ele tenha cinco produtos no arquivo.
    if (!documentosNovos.has(r.cpfCnpj)) documentosNovos.set(r.cpfCnpj, r.nome);
  }

  const acoes: AcaoContrato[] = [];
  const historicoPreservado: {
    chave: string;
    statusAtual: string;
    statusRecusado: string;
    linha: number;
  }[] = [];
  const duplicadasNoLote: { linha: number; chave: string }[] = [];
  const ignoradasPorAntiguidade: {
    chave: string;
    linha: number;
    referenciaDoLote: Date;
    referenciaGravada: Date;
  }[] = [];
  const vistasNoLote = new Set<string>();
  /** campo → em quantos contratos deste lote a base tem valor e o perfil não traz. */
  const naoCobertos = new Map<string, number>();

  for (const registro of registros) {
    const chave = chaveNegocio(registro);

    if (vistasNoLote.has(chave)) {
      // O mesmo contrato duas vezes no mesmo arquivo. A primeira já resolveu.
      duplicadasNoLote.push({ linha: registro.linhaOrigem, chave });
      continue;
    }
    vistasNoLote.add(chave);

    const existente = estado.contratosPorChave.get(chave);
    if (!existente) {
      // Regra 5, a metade que se esquece: arquivo velho CRIA o que falta. Ele
      // não pode reescrever o presente, mas completar buraco não é reescrever.
      acoes.push({ acao: "criar", chave, registro });
      continue;
    }

    if (ehTerminal(existente.status) && existente.status !== registro.status) {
      // Regra 4. Não é conflito a resolver: é histórico a preservar.
      historicoPreservado.push({
        chave,
        statusAtual: existente.status,
        statusRecusado: registro.status,
        linha: registro.linhaOrigem,
      });
      continue;
    }

    // Regra 5. `>=` e não `>`: reprocessar o MESMO relatório atualiza, porque
    // a segunda passada costuma ser a correção da primeira.
    if (
      existente.dataReferencia &&
      registro.dataReferencia.getTime() < existente.dataReferencia.getTime()
    ) {
      ignoradasPorAntiguidade.push({
        chave,
        linha: registro.linhaOrigem,
        referenciaDoLote: registro.dataReferencia,
        referenciaGravada: existente.dataReferencia,
      });
      continue;
    }

    // O que a base tem e este relatório não traz. Contado AQUI, e não na
    // escrita, porque o ensaio precisa da resposta sem gravar nada.
    const trazidos = new Set(registro.camposDoRelatorio);
    for (const campo of existente.preenchidos) {
      if (trazidos.has(campo)) continue;
      naoCobertos.set(campo, (naoCobertos.get(campo) ?? 0) + 1);
    }

    acoes.push({ acao: "atualizar", chave, id: existente.id, registro });
  }

  return {
    linhasLidas: linhas.length,
    rejeitadas,
    pendentes,
    pessoasACriar: [...documentosNovos.entries()].map(([cpfCnpj, nome]) => ({ cpfCnpj, nome })),
    pessoasCasadas,
    acoes,
    historicoPreservado,
    duplicadasNoLote,
    ignoradasPorAntiguidade,
    grafiasAtendente: diagnosticarGrafias(registros),
    // Ordem fixa pelo catálogo, não por volume: a lista é curta e a leitura é
    // comparativa entre importações. Ordenar por contagem faria os campos
    // trocarem de lugar entre um ensaio e o seguinte.
    camposNaoCobertos: CAMPOS_SOBRESCREVIVEIS.filter((c) => naoCobertos.has(c)).map((campo) => ({
      campo,
      contratos: naoCobertos.get(campo) ?? 0,
    })),
  };
}
