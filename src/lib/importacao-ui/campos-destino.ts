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
 * ── A ARMADILHA DO `dataReferencia` ─────────────────────────────────────
 * Ele está em `CAMPOS_COM_COLUNA` e NÃO é coluna de `ContratoCorretora`: está
 * lá para não vazar duplicado dentro de `dadosProduto`, e o valor acaba em
 * `importadoEm`. Na tela ele é a COMPETÊNCIA, não um campo do contrato — daí o
 * grupo próprio. Listá-lo junto dos outros ensinaria a coisa errada bem no
 * campo onde errar inverte a proteção de precedência.
 * ────────────────────────────────────────────────────────────── */

import type { FormatoValor } from "@/lib/importacao/perfil";

export type GrupoDestino = "identificacao" | "contrato" | "valores" | "pessoas" | "competencia";

export type CampoDestino = {
  /** A chave que vai para `mapeamentoColunas`. */
  readonly campo: string;
  /** O que a pessoa lê. Sem jargão de banco. */
  readonly rotulo: string;
  readonly grupo: GrupoDestino;
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
    formatoSugerido: "documento_digitos",
    obrigatorio: true,
    ajuda: "É o único campo que liga a linha a uma pessoa. Nome e e-mail não servem.",
  },
  {
    campo: "nome",
    rotulo: "Nome do cliente",
    grupo: "identificacao",
    formatoSugerido: null,
    obrigatorio: false,
    ajuda: "Só é usado ao cadastrar cliente novo. Nunca para casar com quem já existe.",
  },
  {
    campo: "tipoProduto",
    rotulo: "Produto",
    grupo: "contrato",
    formatoSugerido: null,
    obrigatorio: true,
    ajuda: "Precisa de dicionário: cada palavra do relatório vira um produto conhecido.",
  },
  {
    campo: "parceiro",
    rotulo: "Parceiro (seguradora)",
    grupo: "contrato",
    formatoSugerido: null,
    obrigatorio: false,
    ajuda: "Se mapeado, vence a fonte linha a linha. A fonte só preenche onde a célula vier vazia.",
  },
  {
    campo: "numeroContrato",
    rotulo: "Número da apólice",
    grupo: "contrato",
    formatoSugerido: null,
    obrigatorio: true,
    ajuda: "Junto com parceiro e produto, é o que diz se o contrato já existe.",
  },
  {
    campo: "status",
    rotulo: "Situação",
    grupo: "contrato",
    formatoSugerido: null,
    obrigatorio: true,
    ajuda: "Precisa de dicionário. Cancelado, encerrado e recusado não voltam atrás.",
  },
  {
    campo: "inicioVigencia",
    rotulo: "Início da vigência",
    grupo: "contrato",
    formatoSugerido: "data_ddmmaaaa",
    obrigatorio: true,
  },
  {
    campo: "fimVigencia",
    rotulo: "Fim da vigência",
    grupo: "contrato",
    formatoSugerido: "data_ddmmaaaa",
    obrigatorio: false,
    ajuda: "Vazio no relatório apaga o que está gravado.",
  },
  {
    campo: "premio",
    rotulo: "Prêmio",
    grupo: "valores",
    formatoSugerido: "decimal_ptbr",
    obrigatorio: false,
    ajuda: "Vazio no relatório apaga o valor gravado.",
  },
  {
    campo: "comissao",
    rotulo: "Comissão",
    grupo: "valores",
    formatoSugerido: "decimal_ptbr",
    obrigatorio: false,
    ajuda: "Vazio no relatório apaga o valor gravado.",
  },
  {
    campo: "atendenteCorretora",
    rotulo: "Atendente da Corretora",
    grupo: "pessoas",
    formatoSugerido: null,
    obrigatorio: false,
  },
  {
    campo: "assessorCge",
    rotulo: "CGE do assessor",
    grupo: "pessoas",
    formatoSugerido: null,
    obrigatorio: false,
    ajuda: "Preenchido significa que a pessoa é cliente das duas casas.",
  },
  {
    campo: "dataReferencia",
    rotulo: "Competência (mês do relatório)",
    grupo: "competencia",
    formatoSugerido: "data_ddmmaaaa",
    obrigatorio: false,
    ajuda:
      "De que período é o relatório — não a data de hoje. Mapear esta coluna é o que impede um arquivo antigo de sobrescrever dado mais novo.",
  },
];

/** Só o que vira coluna de contrato. `dataReferencia` fica de fora de propósito. */
export const CAMPOS_DO_CONTRATO: readonly CampoDestino[] = CAMPOS_DESTINO.filter(
  (c) => c.grupo !== "competencia",
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
