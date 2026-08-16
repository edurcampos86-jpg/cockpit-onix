/* ──────────────────────────────────────────────────────────────
 * Status de um `ContratoCorretora` — módulo PURO.
 *
 * Mesma decisão do catálogo de produtos e pelo mesmo motivo: `String` validada
 * em código, não `enum` de banco. Aqui o argumento é até mais forte — status é
 * o campo que mais aparece em `WHERE`, e uma lista que engessa em migration
 * transforma "o parceiro passou a reportar 'em carência'" em faixa vermelha.
 *
 * ── POR QUE ESTES SEIS, E NÃO "ativo / inativo" ─────────────────────────
 * A base importada preserva HISTÓRICO COMPLETO, inclusive o que não está
 * valendo. Um par ativo/inativo colapsaria estados que respondem perguntas
 * diferentes, e o colapso é irreversível: depois de gravado, ninguém
 * reconstrói o motivo.
 *
 *   `cancelado` × `encerrado` é a distinção que mais custa perder. Contrato
 *   que morreu ANTES do fim previsto é churn — alguém desistiu, e vale
 *   investigar. Contrato que chegou ao fim da vigência e não renovou é ciclo
 *   normal, com janela de recompra. Somados num "inativo", a taxa de churn da
 *   corretora passa a ser um número sem significado.
 *
 *   `em_analise` e `recusado` existem porque o histórico inclui proposta que
 *   NÃO virou contrato. Jogá-las fora no import perderia a taxa de conversão
 *   por parceiro, que é exatamente o que decide com quem trabalhar mais.
 *   Note que ambos convivem com `inicioVigencia` no futuro ou estimado — não
 *   há vigência real ainda.
 *
 *   `suspenso` é o único REVERSÍVEL: inadimplência ou pedido do cliente, com
 *   volta a `ativo` sem contrato novo. Tratá-lo como cancelado criaria um
 *   cancelamento fantasma toda vez que alguém atrasasse um boleto.
 *
 * A lista é deliberadamente CURTA. Status de sinistro, de renovação e de
 * cobrança são outras dimensões — se entrarem aqui, viram um enum de 30
 * valores que ninguém filtra corretamente.
 * ────────────────────────────────────────────────────────────── */

export type StatusContrato = {
  readonly id: string;
  readonly nome: string;
  /** Vale como contrato em vigor hoje? Sustenta o filtro padrão das telas. */
  readonly vigente: boolean;
  readonly descricao: string;
};

export const STATUS_CONTRATO: readonly StatusContrato[] = [
  {
    id: "em_analise",
    nome: "Em análise",
    vigente: false,
    descricao: "Proposta enviada ao parceiro, ainda sem aceite. Não há cobertura.",
  },
  {
    id: "recusado",
    nome: "Recusado",
    vigente: false,
    descricao: "O parceiro negou a proposta. Guardado para medir conversão por parceiro.",
  },
  {
    id: "ativo",
    nome: "Ativo",
    vigente: true,
    descricao: "Vigente e com cobertura. É o filtro padrão de qualquer tela.",
  },
  {
    id: "suspenso",
    nome: "Suspenso",
    vigente: false,
    descricao:
      "Temporariamente sem cobertura (inadimplência, pedido do cliente). " +
      "REVERSÍVEL: volta a `ativo` sem contrato novo.",
  },
  {
    id: "cancelado",
    nome: "Cancelado",
    vigente: false,
    descricao:
      "Terminou ANTES do fim previsto, por qualquer das partes. É churn — " +
      "distinto de `encerrado` de propósito.",
  },
  {
    id: "encerrado",
    nome: "Encerrado",
    vigente: false,
    descricao:
      "Chegou ao fim da vigência e não renovou. Ciclo normal, com janela de recompra.",
  },
] as const;

export function statusValidos(): string[] {
  return STATUS_CONTRATO.map((s) => s.id);
}

export function ehStatusValido(id: string): boolean {
  return STATUS_CONTRATO.some((s) => s.id === id);
}

/** Os que contam como contrato em vigor. Usado pelo filtro padrão das telas. */
export function statusVigentes(): string[] {
  return STATUS_CONTRATO.filter((s) => s.vigente).map((s) => s.id);
}

/** Valida na ESCRITA — mesma postura de `exigirTipoProduto`. */
export function exigirStatus(id: string): string {
  if (!ehStatusValido(id)) {
    throw new Error(
      `status inválido: ${JSON.stringify(id)}. Válidos: ${statusValidos().join(", ")}.`,
    );
  }
  return id;
}
