// Schema da busca inteligente de clientes.
//
// Define o vocabulário FECHADO que o classificador (Claude via tool_use)
// pode usar. Tudo que estiver fora deste schema é rejeitado — o modelo
// NÃO compõe SQL, NÃO escreve nomes de coluna; só preenche este record.
//
// Importante: este arquivo é a fonte da verdade tanto pro TypeScript
// (FiltrosBusca) quanto pro JSON Schema enviado à API (BUSCA_TOOL_SCHEMA).
// Mudou um, mudou o outro.

export type OrdenarPor = "saldoCc" | "pl" | "nome";
export type Ordem = "asc" | "desc";

export interface FiltrosBusca {
  saldoCcMin?: number;
  saldoCcMax?: number;
  plMin?: number;
  plMax?: number;
  semMovimentacaoDias?: number;
  nomeContem?: string;
  ordenarPor?: OrdenarPor;
  ordem?: Ordem;
  limite?: number;
}

export const LIMITE_DEFAULT = 20;
export const LIMITE_MAX = 100;

const CAMPOS_PERMITIDOS: ReadonlySet<keyof FiltrosBusca> = new Set([
  "saldoCcMin",
  "saldoCcMax",
  "plMin",
  "plMax",
  "semMovimentacaoDias",
  "nomeContem",
  "ordenarPor",
  "ordem",
  "limite",
]);

const ORDENAR_POR_VALIDOS: ReadonlySet<OrdenarPor> = new Set(["saldoCc", "pl", "nome"]);
const ORDEM_VALIDOS: ReadonlySet<Ordem> = new Set(["asc", "desc"]);

/**
 * JSON Schema enviado à API como `input_schema` da tool `buscar_clientes`.
 * Mantém EXATAMENTE os mesmos campos e tipos do TS — qualquer divergência
 * acaba como um campo bloqueado em runtime por `validarFiltros`.
 *
 * `additionalProperties: false` instrui o modelo a não inventar campos.
 * Reforçamos no validador porque modelos eventualmente desrespeitam.
 */
export const BUSCA_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    saldoCcMin: {
      type: "number",
      description: "Saldo em conta corrente mínimo em reais (R$).",
    },
    saldoCcMax: {
      type: "number",
      description: "Saldo em conta corrente máximo em reais (R$).",
    },
    plMin: {
      type: "number",
      description: "Patrimônio líquido total (PL) mínimo em reais (R$).",
    },
    plMax: {
      type: "number",
      description: "Patrimônio líquido total (PL) máximo em reais (R$).",
    },
    semMovimentacaoDias: {
      type: "integer",
      minimum: 1,
      description: "Filtra clientes cuja última atualização foi há pelo menos N dias atrás.",
    },
    nomeContem: {
      type: "string",
      description: "Substring (case-insensitive) que deve estar contida no nome do cliente.",
    },
    ordenarPor: {
      type: "string",
      enum: ["saldoCc", "pl", "nome"],
      description: "Campo de ordenação dos resultados.",
    },
    ordem: {
      type: "string",
      enum: ["asc", "desc"],
      description: "Direção da ordenação (ascendente ou descendente).",
    },
    limite: {
      type: "integer",
      minimum: 1,
      maximum: LIMITE_MAX,
      description: `Quantos clientes retornar (1 a ${LIMITE_MAX}; padrão ${LIMITE_DEFAULT}).`,
    },
  },
  additionalProperties: false,
};

export type ValidacaoFiltros =
  | { ok: true; filtros: FiltrosBusca; camposIgnorados: string[] }
  | { ok: false; erro: string };

/**
 * Valida estritamente um objeto vindo do tool_use. Rejeita campos não
 * declarados (camposIgnorados, não fatal), e erros de tipo (fatal).
 * Aplica defaults (limite=20) e clamps (limite<=100, semMovimentacaoDias>=1).
 */
export function validarFiltros(bruto: unknown): ValidacaoFiltros {
  if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto)) {
    return { ok: false, erro: "Input da tool não é um objeto JSON." };
  }
  const entrada = bruto as Record<string, unknown>;
  const filtros: FiltrosBusca = {};
  const camposIgnorados: string[] = [];

  for (const [campo, valor] of Object.entries(entrada)) {
    if (!CAMPOS_PERMITIDOS.has(campo as keyof FiltrosBusca)) {
      camposIgnorados.push(campo);
      continue;
    }

    switch (campo as keyof FiltrosBusca) {
      case "saldoCcMin":
      case "saldoCcMax":
      case "plMin":
      case "plMax": {
        if (typeof valor !== "number" || !Number.isFinite(valor)) {
          return { ok: false, erro: `Campo '${campo}' precisa ser número finito.` };
        }
        filtros[campo as "saldoCcMin" | "saldoCcMax" | "plMin" | "plMax"] = valor;
        break;
      }
      case "semMovimentacaoDias": {
        if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 1) {
          return { ok: false, erro: "semMovimentacaoDias precisa ser inteiro >= 1." };
        }
        filtros.semMovimentacaoDias = valor;
        break;
      }
      case "nomeContem": {
        if (typeof valor !== "string") {
          return { ok: false, erro: "nomeContem precisa ser string." };
        }
        const trimmed = valor.trim();
        if (trimmed.length > 0) filtros.nomeContem = trimmed;
        break;
      }
      case "ordenarPor": {
        if (typeof valor !== "string" || !ORDENAR_POR_VALIDOS.has(valor as OrdenarPor)) {
          return {
            ok: false,
            erro: `ordenarPor precisa ser um de ${[...ORDENAR_POR_VALIDOS].join("|")}.`,
          };
        }
        filtros.ordenarPor = valor as OrdenarPor;
        break;
      }
      case "ordem": {
        if (typeof valor !== "string" || !ORDEM_VALIDOS.has(valor as Ordem)) {
          return { ok: false, erro: `ordem precisa ser 'asc' ou 'desc'.` };
        }
        filtros.ordem = valor as Ordem;
        break;
      }
      case "limite": {
        if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 1) {
          return { ok: false, erro: "limite precisa ser inteiro >= 1." };
        }
        filtros.limite = Math.min(valor, LIMITE_MAX);
        break;
      }
    }
  }

  if (filtros.limite === undefined) filtros.limite = LIMITE_DEFAULT;

  // Coerência: se ordenarPor foi setado mas ordem não, default 'desc'
  // (cliente quer "top N" — descendente é o esperado em quase todos os casos).
  if (filtros.ordenarPor && !filtros.ordem) filtros.ordem = "desc";

  return { ok: true, filtros, camposIgnorados };
}
