/* ──────────────────────────────────────────────────────────────
 * Os destinos que a tela de mapeamento oferece.
 *
 * Módulo de UI, PURO. O motor (`src/lib/corretora/**`, `src/lib/importacao/**`)
 * não é tocado por nada daqui.
 *
 * ── POR QUE ESTA LISTA É DUPLICADA, E POR QUE ISSO NÃO É DESCUIDO ───────
 * A verdade de runtime é `CAMPOS_COM_COLUNA`, em `importar-contratos.ts` — e
 * ela é `const` sem `export`. Exportá-la seria mudar o motor, que está fora do
 * escopo desta entrega.
 *
 * Então a lista vive aqui em duplicata, e `campos-destino.test.ts` LÊ O FONTE
 * do motor e falha se as duas divergirem. Duplicata com guarda é dívida
 * declarada; duplicata sem guarda é a que apodrece.
 *
 * ── DOIS CAMPOS DE `CAMPOS_COM_COLUNA` NÃO VIRAM COLUNA ─────────────────
 * Estar no Set significa apenas "não vaze duplicado para `dadosProduto`" —
 * não significa que exista coluna para receber. Dois casos, e os dois enganam:
 *
 * `dataReferencia` é a COMPETÊNCIA. O valor acaba em `importadoEm`, e é ele
 * que impede um relatório antigo de sobrescrever dado mais novo. Listá-lo
 * junto dos campos do contrato ensinaria errado bem onde errar inverte a
 * proteção de precedência.
 *
 * `nome` NÃO É GRAVADO EM LUGAR NENHUM. `PessoaGrupo` não tem coluna de nome
 * (`prisma/schema.prisma`, e o `createMany` de `executar-importacao.ts` grava
 * só `cpfCnpj` e `tipoDocumento`); `ContratoCorretora` também não. Como o
 * campo está em `CAMPOS_COM_COLUNA`, o valor nem cai em `dadosProduto`: é
 * lido e jogado fora. Oferecê-lo como destino sem dizer isso faria a pessoa
 * mapear uma coluna, conferir o ensaio e o banco ficar sem nome — por isso ele
 * aparece marcado como descartado, e não some da lista (sumir quebraria a
 * paridade com o motor, que é a guarda deste arquivo).
 *
 * É `destino` que separa os três casos, e é nele que `CAMPOS_DO_CONTRATO`
 * filtra — não no grupo, que é só arrumação visual.
 * ────────────────────────────────────────────────────────────── */

import type { FormatoValor } from "@/lib/importacao/perfil";

export type GrupoDestino = "identificacao" | "contrato" | "valores" | "pessoas" | "competencia";

/**
 * Onde o valor mapeado termina de verdade.
 *
 * `contrato` → vira coluna de `ContratoCorretora`.
 * `competencia` → vira `importadoEm`, a precedência do lote.
 * `descartado` → o motor lê e joga fora. Hoje só `nome`.
 */
export type DestinoFinal = "contrato" | "competencia" | "descartado";

export type CampoDestino = {
  /** A chave que vai para `mapeamentoColunas`. */
  readonly campo: string;
  /** O que a pessoa lê. Sem jargão de banco. */
  readonly rotulo: string;
  readonly grupo: GrupoDestino;
  readonly destino: DestinoFinal;
  /** O formato que o perfil deve declarar. `null` = texto, o padrão. */
  readonly formatoSugerido: FormatoValor | null;
  /** Sem ele a linha é rejeitada. */
  readonly obrigatorio: boolean;
  /** Uma frase só, quando o nome não basta. */
  readonly ajuda?: string;
};

export const CAMPOS_DESTINO: readonly CampoDestino[] = [
  {
    campo: "cpfCnpj",
    rotulo: "CPF ou CNPJ",
    grupo: "identificacao",
    destino: "contrato",
    formatoSugerido: "documento_digitos",
    obrigatorio: true,
    ajuda: "É o único campo que liga a linha a uma pessoa. Nome e e-mail não servem.",
  },
  {
    campo: "nome",
    rotulo: "Nome do cliente (descartado hoje)",
    grupo: "identificacao",
    destino: "descartado",
    formatoSugerido: null,
    obrigatorio: false,
    ajuda:
      "Não existe onde guardar: o cadastro de cliente só tem o documento. Mapear esta coluna não faz nada — o valor é lido e jogado fora.",
  },
  {
    campo: "tipoProduto",
    rotulo: "Produto",
    grupo: "contrato",
    destino: "contrato",
    formatoSugerido: null,
    obrigatorio: true,
    ajuda: "Precisa de dicionário: cada palavra do relatório vira um produto conhecido.",
  },
  {
    campo: "parceiro",
    rotulo: "Parceiro (seguradora)",
    grupo: "contrato",
    destino: "contrato",
    formatoSugerido: null,
    obrigatorio: false,
    ajuda: "Se mapeado, vence a fonte linha a linha. A fonte só preenche onde a célula vier vazia.",
  },
  {
    campo: "numeroContrato",
    rotulo: "Número da apólice",
    grupo: "contrato",
    destino: "contrato",
    formatoSugerido: null,
    obrigatorio: true,
    ajuda: "Junto com parceiro e produto, é o que diz se o contrato já existe.",
  },
  {
    campo: "status",
    rotulo: "Situação",
    grupo: "contrato",
    destino: "contrato",
    formatoSugerido: null,
    obrigatorio: true,
    ajuda: "Precisa de dicionário. Cancelado, encerrado e recusado não voltam atrás.",
  },
  {
    campo: "inicioVigencia",
    rotulo: "Início da vigência",
    grupo: "contrato",
    destino: "contrato",
    formatoSugerido: "data_ddmmaaaa",
    obrigatorio: true,
  },
  {
    campo: "fimVigencia",
    rotulo: "Fim da vigência",
    grupo: "contrato",
    destino: "contrato",
    formatoSugerido: "data_ddmmaaaa",
    obrigatorio: false,
    ajuda: "Vazio no relatório apaga o que está gravado.",
  },
  {
    campo: "premio",
    rotulo: "Prêmio",
    grupo: "valores",
    destino: "contrato",
    formatoSugerido: "decimal_ptbr",
    obrigatorio: false,
    ajuda: "Vazio no relatório apaga o valor gravado.",
  },
  {
    campo: "comissao",
    rotulo: "Comissão",
    grupo: "valores",
    destino: "contrato",
    formatoSugerido: "decimal_ptbr",
    obrigatorio: false,
    ajuda: "Vazio no relatório apaga o valor gravado.",
  },
  {
    campo: "atendenteCorretora",
    rotulo: "Atendente da Corretora",
    grupo: "pessoas",
    destino: "contrato",
    formatoSugerido: null,
    obrigatorio: false,
  },
  {
    campo: "assessorCge",
    rotulo: "CGE do assessor",
    grupo: "pessoas",
    destino: "contrato",
    formatoSugerido: null,
    obrigatorio: false,
    ajuda: "Preenchido significa que a pessoa é cliente das duas casas.",
  },
  {
    campo: "dataReferencia",
    rotulo: "Competência (mês do relatório)",
    grupo: "competencia",
    destino: "competencia",
    formatoSugerido: "data_ddmmaaaa",
    obrigatorio: false,
    ajuda:
      "De que período é o relatório — não a data de hoje. Mapear esta coluna é o que impede um arquivo antigo de sobrescrever dado mais novo.",
  },
];

/** Só o que vira coluna de contrato — sem a competência e sem o descartado. */
export const CAMPOS_DO_CONTRATO: readonly CampoDestino[] = CAMPOS_DESTINO.filter(
  (c) => c.destino === "contrato",
);

export const CAMPOS_OBRIGATORIOS: readonly string[] = CAMPOS_DESTINO.filter(
  (c) => c.obrigatorio,
).map((c) => c.campo);

/** Campos que EXIGEM dicionário: sem ele, o rótulo do arquivo não resolve. */
export const CAMPOS_COM_DICIONARIO: readonly string[] = ["tipoProduto", "status"];

export function rotuloDoCampo(campo: string): string {
  return CAMPOS_DESTINO.find((c) => c.campo === campo)?.rotulo ?? campo;
}

/**
 * O que falta para o mapeamento virar perfil válido.
 *
 * Não substitui `validarPerfil` — aquele é a régua do servidor e continua
 * sendo a fonte da verdade. Este roda enquanto a pessoa arrasta, para ela não
 * descobrir no envio o que dá para saber na hora.
 */
export function faltamObrigatorios(mapeamento: Readonly<Record<string, string>>): string[] {
  const destinos = new Set(Object.values(mapeamento));
  return CAMPOS_OBRIGATORIOS.filter((c) => !destinos.has(c));
}

/**
 * Destinos apontados por mais de uma coluna do arquivo.
 *
 * É a mesma regra do servidor (`validarPerfil`), antecipada: lá, duas colunas
 * para o mesmo destino é ERRO, porque a segunda sobrescreveria a primeira em
 * silêncio e o dado perdido seria o da esquerda da planilha. Descobrir isso no
 * envio, depois de arrastar quarenta colunas, é o tipo de tempo que não volta.
 */
export function destinosDuplicados(
  mapeamento: Readonly<Record<string, string>>,
): { campo: string; origens: string[] }[] {
  const porDestino = new Map<string, string[]>();
  for (const [origem, destino] of Object.entries(mapeamento)) {
    porDestino.set(destino, [...(porDestino.get(destino) ?? []), origem]);
  }
  return [...porDestino.entries()]
    .filter(([, origens]) => origens.length > 1)
    .map(([campo, origens]) => ({ campo, origens }));
}
