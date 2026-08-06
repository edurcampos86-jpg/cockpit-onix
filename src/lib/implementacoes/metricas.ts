/**
 * Métrica de "ROI de backlog": quantas ideias da fila viraram entrega, e em
 * quanto tempo.
 *
 * Módulo puro (sem Prisma, sem server-only): recebe as linhas já lidas e
 * calcula. Isso mantém o cálculo testável sem banco — que é o ponto, porque
 * mediana e "PR sem merge" são exatamente onde um off-by-one passa despercebido.
 */

export type LinhaMetrica = {
  createdAt: Date;
  prNumero: number | null;
  prStatus: string | null;
  prMergedAt: Date | null;
};

export type MetricasBacklog = {
  total: number;
  comPr: number;
  entregues: number;
  /** Mediana de dias entre criar a sugestão e mergear o PR. null se não há entrega. */
  leadTimeMedianoDias: number | null;
  /** % da fila que virou entrega, 0–100, arredondado. */
  taxaEntrega: number;
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Mediana, não média, de propósito: uma ideia que ficou 8 meses parada na fila
 * puxaria a média para um número que não descreve nenhum caso real. A mediana
 * responde "quanto costuma levar", que é a pergunta de quem olha.
 */
export function medianaDias(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  const bruto =
    ord.length % 2 === 0 ? (ord[meio - 1] + ord[meio]) / 2 : ord[meio];
  return Math.round(bruto * 10) / 10;
}

export function calcularMetricasBacklog(
  linhas: readonly LinhaMetrica[],
): MetricasBacklog {
  const comPr = linhas.filter((l) => l.prNumero != null).length;

  // "Entregue" exige prMergedAt, não prStatus === "merged": o status é digitado
  // à mão e pode estar adiantado; a data é carimbada pelo servidor (ou vem do
  // GitHub na sincronia). Contar pelo status inflaria a métrica com PR que o
  // usuário marcou otimista antes de mergear.
  const entregues = linhas.filter((l) => l.prMergedAt != null);

  const dias = entregues
    .map((l) => (l.prMergedAt!.getTime() - l.createdAt.getTime()) / MS_POR_DIA)
    // Data de merge anterior à criação é dado corrompido, não lead time zero —
    // deixar entrar como negativo puxaria a mediana para baixo em silêncio.
    .filter((d) => d >= 0);

  return {
    total: linhas.length,
    comPr,
    entregues: entregues.length,
    leadTimeMedianoDias: medianaDias(dias),
    taxaEntrega:
      linhas.length === 0
        ? 0
        : Math.round((entregues.length / linhas.length) * 100),
  };
}
