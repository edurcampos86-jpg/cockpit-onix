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
  readonly linhaOrigem: number;
  readonly origemExtracao: OrigemExtracao;
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
  readonly contratosPorChave: ReadonlyMap<string, { readonly id: string; readonly status: string }>;
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
  readonly grafiasAtendente: readonly GrafiaAtendente[];
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
 */
export function montarRegistro(
  linha: LinhaAplicada,
  parceiroPadrao: string,
  dicionarioProduto?: Readonly<Record<string, string>>,
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
      linhaOrigem: linha.numero,
      origemExtracao: linha.origem,
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
  },
): Plano {
  const rejeitadas: LinhaRejeitada[] = [];
  const registros: RegistroContrato[] = [];
  let pendentes = 0;

  for (const linha of linhas) {
    if (Object.keys(linha.pendentes).length > 0) pendentes += 1;
    const r = montarRegistro(linha, opcoes.parceiroPadrao, opcoes.dicionarioProduto);
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
  const vistasNoLote = new Set<string>();

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
    grafiasAtendente: diagnosticarGrafias(registros),
  };
}
