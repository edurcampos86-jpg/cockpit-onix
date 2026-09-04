import type { Casamento } from "@/lib/reunioes/casar-cliente";

export const PLAUD_CONCILIACAO_LIMITE_PADRAO = 50;
export const PLAUD_CONCILIACAO_LIMITE_MAXIMO = 100;

export type EstadoConciliacao =
  | "cliente_sugerido"
  | "ambiguo"
  | "sem_cliente"
  | "sem_transcricao";

export type PlaudConciliacaoItem = {
  id: string;
  titulo: string;
  data: string;
  duracaoMin: number | null;
  participantes: string[];
  vendedor: string | null;
  recebidoEm: string;
  temTranscricao: boolean;
  estado: EstadoConciliacao;
  clienteSugerido: { id: string; nome: string; evidencia: string } | null;
  clienteAmbiguo: string | null;
  podeAbrirPreview: boolean;
  previewUrl: string | null;
};

export type PlaudConciliacaoMetricas = {
  recebidasNestaLista: number;
  comSugestaoNominalNestaLista: number;
  excecoesNestaLista: number;
  ultimaEntradaRegistradaEm: string | null;
  ultimoSincronismo: null;
  importadasNaFicha: null;
  aguardandoRevisao: null;
  falhas: null;
};

export type PlaudConciliacaoPayload = {
  items: PlaudConciliacaoItem[];
  metricas: PlaudConciliacaoMetricas;
  janela: {
    limite: number;
    truncada: boolean;
    descricao: string;
  };
};

/** A rota/tela nova só existe quando a flag foi explicitamente ligada. */
export function deveExporMesaConciliacao(flagLigada: boolean): boolean {
  return flagLigada === true;
}

export function lerLimiteConciliacao(valor: string | null): number | null {
  if (valor === null || valor === "") return PLAUD_CONCILIACAO_LIMITE_PADRAO;
  if (!/^\d+$/.test(valor)) return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > PLAUD_CONCILIACAO_LIMITE_MAXIMO) {
    return null;
  }
  return numero;
}

export function estadoDaConciliacao(
  casamento: Casamento,
  temTranscricao: boolean,
): EstadoConciliacao {
  if (!temTranscricao) return "sem_transcricao";
  if (casamento.tipo === "casou") return "cliente_sugerido";
  if (casamento.tipo === "ambiguo") return "ambiguo";
  return "sem_cliente";
}

const PRIORIDADE_ESTADO: Record<EstadoConciliacao, number> = {
  sem_transcricao: 0,
  ambiguo: 1,
  sem_cliente: 2,
  cliente_sugerido: 3,
};

export function ordenarConciliacao(
  items: readonly PlaudConciliacaoItem[],
): PlaudConciliacaoItem[] {
  return [...items].sort((a, b) => {
    const estado = PRIORIDADE_ESTADO[a.estado] - PRIORIDADE_ESTADO[b.estado];
    if (estado !== 0) return estado;
    return new Date(a.data).getTime() - new Date(b.data).getTime();
  });
}

export function montarMetricasConciliacao(
  items: readonly PlaudConciliacaoItem[],
): PlaudConciliacaoMetricas {
  const comSugestao = items.filter((item) => item.estado === "cliente_sugerido").length;
  return {
    recebidasNestaLista: items.length,
    comSugestaoNominalNestaLista: comSugestao,
    excecoesNestaLista: items.length - comSugestao,
    ultimaEntradaRegistradaEm:
      items.reduce<string | null>((maisRecente, item) => {
        if (!maisRecente) return item.recebidoEm;
        return new Date(item.recebidoEm) > new Date(maisRecente)
          ? item.recebidoEm
          : maisRecente;
      }, null),
    ultimoSincronismo: null,
    importadasNaFicha: null,
    aguardandoRevisao: null,
    falhas: null,
  };
}

export function payloadTemCamposSensiveis(payload: PlaudConciliacaoPayload): boolean {
  const texto = JSON.stringify(payload);
  return ["transcription", "summary", "insights", "actionItems", "audioUrl", "lead"]
    .some((campo) => texto.includes(`\"${campo}\"`));
}
