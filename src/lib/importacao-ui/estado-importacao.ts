/* ──────────────────────────────────────────────────────────────
 * A máquina de estados da tela de import. PURA — sem React, sem fetch.
 *
 * ── A INVARIANTE QUE ESTE MÓDULO EXISTE PARA SUSTENTAR ──────────────────
 * "Aplicar" só liga para um ensaio que corresponde EXATAMENTE ao que está na
 * tela agora. Trocar uma coluna, mudar a competência ou trocar o arquivo
 * depois do ensaio invalida o ensaio — e o botão desliga sozinho.
 *
 * Sem isso, o caminho mais natural do mundo grava outra coisa: rodo o ensaio,
 * vejo "2.610 atualizações", ajusto um mapeamento porque reparei num erro, e
 * clico em aplicar lendo os números do ensaio ANTERIOR. A tela mostraria a
 * conferência de um plano que não é o que vai rodar.
 *
 * ── O LIMITE, QUE VALE DIZER ANTES DA GARANTIA ──────────────────────────
 * Isto vale para `xlsx` e `csv`, cuja leitura é determinística. Em `pdf` e
 * `docx` a rota RE-EXTRAI o arquivo por IA a cada chamada
 * (`src/lib/importacao/extracao-ia.ts`), sem cache das linhas do ensaio: mesma
 * assinatura pode produzir plano diferente. Nenhuma assinatura resolve isso
 * daqui — é a leitura que não é reprodutível —, e afirmar a garantia sem a
 * ressalva seria vender proteção que o formato não tem.
 *
 * A assinatura (`assinaturaDoPlano`) é o que amarra os dois: arquivo, PERFIL
 * (por conteúdo, não só por id), competência, mapeamento e parceiro padrão.
 *
 * Cobrir o perfil por CONTEÚDO é o ponto fino. Quem monta o plano é a rota, e
 * a rota lê o perfil do BANCO — não o que está na tela. Editar o perfil entre
 * o ensaio e o gravar mudaria o plano sem mudar o `perfilId`, e uma assinatura
 * que olhasse só o id daria o ensaio por válido. `impressaoDoPerfil` cobre os
 * SEIS campos que a rota usa para montar o plano: `formato`, `extracao`,
 * `mapeamentoColunas`, `formatosValor`, `dicionarios` e `fonte`. Faltar um só
 * já reabre o buraco — trocar a aba da planilha ou a linha do cabeçalho muda o
 * plano inteiro e não muda mais nada que a assinatura veja.
 *
 * ── POR QUE `mapeamento` E `parceiroPadrao` TAMBÉM ENTRAM ───────────────
 * Os dois são estado de TELA, e só chegam ao motor se quem chama a rota os
 * enviar. Um chamador que não os envie paga, no pior caso, um ensaio a mais —
 * a assinatura muda sem o plano mudar. Assinar demais custa uma reexecução;
 * assinar de menos custa gravar plano diferente do conferido. Entre os dois
 * erros, este módulo escolhe o barato.
 *
 * ── COMPETÊNCIA ─────────────────────────────────────────────────────────
 * O caminho normal é a coluna do arquivo. `manual` existe, é exceção, e a
 * máquina obriga a tela a dizer isso: `competenciaEhExcecao` fica `true`, e é
 * dele que sai o aviso na tela. Competência errada não estraga esta
 * importação — estraga a PRÓXIMA, quando a regra de precedência comparar
 * contra uma data inventada.
 * ────────────────────────────────────────────────────────────── */

import { faltamObrigatorios, destinosDuplicados } from "./campos-destino";

export type ArquivoEscolhido = {
  readonly nome: string;
  readonly tamanhoBytes: number;
  /** Rótulos do cabeçalho, como vieram. Vazio até a sondagem responder. */
  readonly colunas: readonly string[];
};

export type Competencia =
  | { readonly origem: "coluna" }
  | { readonly origem: "manual"; readonly valor: string };

export type EstadoImportacao = {
  readonly arquivo: ArquivoEscolhido | null;
  readonly perfilId: string | null;
  /**
   * Impressão do CONTEÚDO do perfil quando ele foi carregado — mapeamento,
   * formatos e dicionários. Muda quando o perfil muda no banco.
   */
  readonly impressaoDoPerfil: string;
  readonly parceiroPadrao: string;
  /** rótulo do arquivo → campo de destino. */
  readonly mapeamento: Readonly<Record<string, string>>;
  readonly competencia: Competencia;
  /** Assinatura do estado quando o último ensaio rodou. `null` = sem ensaio. */
  readonly ensaioDe: string | null;
  readonly aplicando: boolean;
};

export const ESTADO_INICIAL: EstadoImportacao = {
  arquivo: null,
  perfilId: null,
  impressaoDoPerfil: "",
  parceiroPadrao: "",
  mapeamento: {},
  competencia: { origem: "coluna" },
  ensaioDe: null,
  aplicando: false,
};

export type AcaoImportacao =
  | { tipo: "escolheu-arquivo"; arquivo: ArquivoEscolhido }
  | {
      tipo: "escolheu-perfil";
      perfilId: string;
      mapeamento: Readonly<Record<string, string>>;
      impressaoDoPerfil: string;
    }
  | { tipo: "mapeou"; rotulo: string; campo: string | null }
  | { tipo: "definiu-parceiro-padrao"; valor: string }
  | { tipo: "competencia-da-coluna" }
  | { tipo: "competencia-manual"; valor: string }
  | { tipo: "ensaiou" }
  | { tipo: "aplicando" }
  | { tipo: "aplicou" }
  | { tipo: "falhou" };

/**
 * Tudo que muda o plano, e nada além disso.
 *
 * Ordena as chaves porque arrastar duas colunas em ordem diferente produz o
 * mesmo plano — invalidar o ensaio ali seria ruído, não proteção.
 */
export function assinaturaDoPlano(e: EstadoImportacao): string {
  const mapeamento = Object.entries(e.mapeamento)
    .filter(([, campo]) => campo !== "")
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify({
    arquivo: e.arquivo ? [e.arquivo.nome, e.arquivo.tamanhoBytes] : null,
    perfilId: e.perfilId,
    impressaoDoPerfil: e.impressaoDoPerfil,
    parceiroPadrao: e.parceiroPadrao.trim(),
    mapeamento,
    competencia: e.competencia,
  });
}

export function reduzir(e: EstadoImportacao, acao: AcaoImportacao): EstadoImportacao {
  switch (acao.tipo) {
    case "escolheu-arquivo":
      // Arquivo novo zera o mapeamento: os rótulos são de outro cabeçalho, e
      // aproveitá-los mapearia colunas que talvez nem existam neste arquivo.
      return { ...e, arquivo: acao.arquivo, mapeamento: {}, ensaioDe: null };
    case "escolheu-perfil":
      return {
        ...e,
        perfilId: acao.perfilId,
        impressaoDoPerfil: acao.impressaoDoPerfil,
        mapeamento: acao.mapeamento,
        ensaioDe: null,
      };
    case "mapeou": {
      const mapeamento = { ...e.mapeamento };
      if (acao.campo === null || acao.campo === "") delete mapeamento[acao.rotulo];
      else mapeamento[acao.rotulo] = acao.campo;
      return { ...e, mapeamento, ensaioDe: null };
    }
    case "definiu-parceiro-padrao":
      return { ...e, parceiroPadrao: acao.valor, ensaioDe: null };
    case "competencia-da-coluna":
      return { ...e, competencia: { origem: "coluna" }, ensaioDe: null };
    case "competencia-manual":
      return { ...e, competencia: { origem: "manual", valor: acao.valor }, ensaioDe: null };
    case "ensaiou":
      return { ...e, ensaioDe: assinaturaDoPlano(e) };
    case "aplicando":
      return { ...e, aplicando: true };
    case "aplicou":
      // O plano foi consumido: o estado do banco mudou, e o ensaio que
      // descrevia "o que vai acontecer" agora descreve o que já aconteceu.
      return { ...e, aplicando: false, ensaioDe: null };
    case "falhou":
      // ZERA o ensaio, e isto NÃO é excesso de zelo: o gravar escreve em lotes
      // (`executar-importacao.ts`) e a rota devolve erro depois de parte já ter
      // entrado. Depois de uma falha, o banco não é mais o banco que o ensaio
      // descreveu — religar o botão com os números de antes é oferecer um
      // segundo clique em cima de base já mexida.
      return { ...e, aplicando: false, ensaioDe: null };
  }
}

/** `true` quando a competência foi digitada em vez de lida do arquivo. */
export function competenciaEhExcecao(e: EstadoImportacao): boolean {
  return e.competencia.origem === "manual";
}

/** O que impede o ensaio de rodar. Lista vazia = pode ensaiar. */
export function impedimentosDoEnsaio(e: EstadoImportacao): string[] {
  const problemas: string[] = [];
  if (!e.arquivo) problemas.push("Escolha o arquivo.");

  for (const campo of faltamObrigatorios(e.mapeamento)) {
    problemas.push(`Falta apontar uma coluna para ${campo}.`);
  }
  for (const { campo } of destinosDuplicados(e.mapeamento)) {
    problemas.push(`Duas colunas apontam para ${campo}. Escolha uma.`);
  }

  const mapeiaReferencia = Object.values(e.mapeamento).includes("dataReferencia");
  if (e.competencia.origem === "coluna" && !mapeiaReferencia) {
    problemas.push(
      "Aponte a coluna de competência do relatório, ou informe a competência à mão.",
    );
  }
  if (e.competencia.origem === "manual" && !competenciaValida(e.competencia.valor)) {
    problemas.push("A competência informada precisa estar no formato AAAA-MM.");
  }
  return problemas;
}

/** Aceita AAAA-MM e AAAA-MM-DD, que é o que a rota de import recebe. */
export function competenciaValida(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(valor.trim());
  if (!m) return false;
  const mes = Number(m[2]);
  const dia = m[3] === undefined ? 1 : Number(m[3]);
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31;
}

/** Se o ensaio na tela ainda descreve o que aplicar vai fazer. */
export function ensaioValeParaAgora(e: EstadoImportacao): boolean {
  return e.ensaioDe !== null && e.ensaioDe === assinaturaDoPlano(e);
}

export function podeAplicar(e: EstadoImportacao): boolean {
  return !e.aplicando && ensaioValeParaAgora(e) && impedimentosDoEnsaio(e).length === 0;
}

export type Etapa = "arquivo" | "mapeamento" | "ensaio" | "aplicar";

/** Em que passo a tela está. Só para orientar, nunca para liberar botão. */
export function etapaAtual(e: EstadoImportacao): Etapa {
  if (!e.arquivo) return "arquivo";
  if (impedimentosDoEnsaio(e).length > 0) return "mapeamento";
  if (!ensaioValeParaAgora(e)) return "ensaio";
  return "aplicar";
}

/**
 * A impressão do conteúdo do perfil, para a assinatura enxergar edição feita
 * fora desta tela. Ordena as chaves porque o Postgres não garante ordem de
 * `Json` e ordem diferente não é perfil diferente.
 */
export function impressaoDoPerfil(perfil: {
  formato?: string;
  /** `extracao` diz a aba, a linha do cabeçalho, o delimitador, os padrões. */
  extracao?: unknown;
  fonte?: string;
  mapeamentoColunas?: Readonly<Record<string, string>>;
  formatosValor?: Readonly<Record<string, string>>;
  dicionarios?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}): string {
  const ordenar = (o: Readonly<Record<string, unknown>> | undefined) =>
    Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([
    perfil.formato ?? "",
    // `extracao` é `Json` de forma variável por formato: ordenar as chaves do
    // primeiro nível basta para a ordem do Postgres não gerar falso positivo.
    ordenar(perfil.extracao as Readonly<Record<string, unknown>> | undefined),
    perfil.fonte ?? "",
    ordenar(perfil.mapeamentoColunas),
    ordenar(perfil.formatosValor),
    ordenar(perfil.dicionarios).map(([campo, tabela]) => [
      campo,
      ordenar(tabela as Readonly<Record<string, string>>),
    ]),
  ]);
}
