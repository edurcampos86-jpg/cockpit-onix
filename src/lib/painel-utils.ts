// Utilitários para o Painel Semanal

export type Status = "green" | "yellow" | "red";

export interface ResultadoData {
  metaFaturamento: number | null;
  faturamentoAtual: number;
  percentual: number;
  status: Status;
}

export interface NegocioParado {
  id: string;
  nomeCliente: string;
  valor: number;
  responsavel: string;
  etapa: string;
  diasSemAtividade: number;
}

export interface ProcessoData {
  totalNegocios: number;
  negociosComAtividade7d: number;
  percentualAtivos: number;
  negociosParados: NegocioParado[];
  status: Status;
}

export interface VendedorTaxa {
  vendedor: string;
  taxa: number;
}

export interface ComportamentoData {
  taxaRespostaMedia: number;
  taxaRespostaPorVendedor: VendedorTaxa[];
  scoreMedio: number;
  status: Status;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function getStatus(
  value: number,
  greenThreshold: number,
  yellowThreshold: number,
): Status {
  if (value >= greenThreshold) return "green";
  if (value >= yellowThreshold) return "yellow";
  return "red";
}

export function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeResultado(
  metaMensal: { metaFaturamento: number; faturamentoAtual: number } | null,
): ResultadoData {
  if (!metaMensal || metaMensal.metaFaturamento === 0) {
    return { metaFaturamento: null, faturamentoAtual: 0, percentual: 0, status: "red" };
  }

  const { metaFaturamento, faturamentoAtual } = metaMensal;

  // Calcula a meta proporcional ao dia do mês
  const hoje = new Date();
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const diaAtual = hoje.getDate();
  const metaProporcional = (metaFaturamento / diasNoMes) * diaAtual;

  const percentual =
    metaProporcional > 0
      ? Math.round((faturamentoAtual / metaProporcional) * 100)
      : 0;

  return {
    metaFaturamento,
    faturamentoAtual,
    percentual,
    status: getStatus(percentual, 80, 60),
  };
}

export function computeProcesso(
  deals: Array<{
    id: string;
    nomeCliente: string;
    valor: number;
    responsavel: string;
    etapa: string;
    ultimaAtividade: Date;
  }>,
): ProcessoData {
  const agora = Date.now();
  const seteDiasMs = 7 * 24 * 60 * 60 * 1000;
  const quarentaEOitoHorasMs = 48 * 60 * 60 * 1000;

  const comAtividade7d = deals.filter(
    (d) => agora - d.ultimaAtividade.getTime() <= seteDiasMs,
  );

  const parados = deals
    .filter((d) => agora - d.ultimaAtividade.getTime() > quarentaEOitoHorasMs)
    .map((d) => ({
      id: d.id,
      nomeCliente: d.nomeCliente,
      valor: d.valor,
      responsavel: d.responsavel,
      etapa: d.etapa,
      diasSemAtividade: daysSince(d.ultimaAtividade),
    }))
    .sort((a, b) => b.diasSemAtividade - a.diasSemAtividade);

  const totalNegocios = deals.length;
  const percentualAtivos =
    totalNegocios > 0
      ? Math.round((comAtividade7d.length / totalNegocios) * 100)
      : 0;

  return {
    totalNegocios,
    negociosComAtividade7d: comAtividade7d.length,
    percentualAtivos,
    negociosParados: parados,
    status:
      parados.length === 0
        ? "green"
        : parados.length <= 2
          ? "yellow"
          : "red",
  };
}

export function computeComportamento(
  metricas: Array<{
    vendedor: string;
    conversasAnalisadas: number;
    conversasSemResposta: number;
    score: number;
  }>,
): ComportamentoData {
  if (metricas.length === 0) {
    return {
      taxaRespostaMedia: 0,
      taxaRespostaPorVendedor: [],
      scoreMedio: 0,
      status: "red",
    };
  }

  const porVendedor: VendedorTaxa[] = metricas.map((m) => {
    const taxa =
      m.conversasAnalisadas > 0
        ? Math.round(
            ((m.conversasAnalisadas - m.conversasSemResposta) /
              m.conversasAnalisadas) *
              100,
          )
        : 0;
    return { vendedor: m.vendedor, taxa };
  });

  const taxaRespostaMedia =
    porVendedor.length > 0
      ? Math.round(
          porVendedor.reduce((sum, v) => sum + v.taxa, 0) / porVendedor.length,
        )
      : 0;

  const scoreMedio = Math.round(
    metricas.reduce((sum, m) => sum + m.score, 0) / metricas.length,
  );

  return {
    taxaRespostaMedia,
    taxaRespostaPorVendedor: porVendedor,
    scoreMedio,
    status: getStatus(taxaRespostaMedia, 80, 60),
  };
}
