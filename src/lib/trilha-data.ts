// Trilhas de Desenvolvimento — Onix Corretora
// Projeto T&D: Abril 2026 a Março 2031 (5 anos)
//
// O DADO (TRILHAS + tipos Fase/Trilha) vive em @/content/trilha-data.
// Aqui ficam o marco-zero do projeto e as FUNÇÕES que operam sobre o dado.

import { TRILHAS, type Fase, type Trilha } from "@/content/trilha-data";

// Re-exporta o dado/tipos para não quebrar quem importa de @/lib/trilha-data.
export { TRILHAS };
export type { Fase, Trilha };

export const PROJETO_INICIO = new Date("2026-04-01");

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Calcula o mês atual do projeto (1 = abril 2026) */
export function getMesAtual(): number {
  const agora = new Date();
  const diffMs = agora.getTime() - PROJETO_INICIO.getTime();
  const diffMeses = diffMs / (1000 * 60 * 60 * 24 * 30.44);
  return Math.max(1, Math.ceil(diffMeses));
}

/** Retorna a fase atual baseada no mês */
export function getFaseAtual(trilha: Trilha): Fase | null {
  const mes = getMesAtual();
  return trilha.fases.find((f) => mes >= f.mesInicio && mes <= f.mesFim) ?? null;
}

/** Progresso geral da trilha (0 a 100) */
export function getProgressoGeral(trilha: Trilha): number {
  const mes = getMesAtual();
  const totalMeses = trilha.fases[trilha.fases.length - 1].mesFim;
  return Math.min(100, Math.round((mes / totalMeses) * 100));
}

/** Progresso dentro da fase atual (0 a 100) */
export function getProgressoFase(fase: Fase): number {
  const mes = getMesAtual();
  if (mes < fase.mesInicio) return 0;
  if (mes > fase.mesFim) return 100;
  const total = fase.mesFim - fase.mesInicio + 1;
  const progresso = mes - fase.mesInicio + 1;
  return Math.round((progresso / total) * 100);
}

/** Status da fase: concluida / em_andamento / futura */
export function getStatusFase(fase: Fase): "concluida" | "em_andamento" | "futura" {
  const mes = getMesAtual();
  if (mes > fase.mesFim) return "concluida";
  if (mes >= fase.mesInicio) return "em_andamento";
  return "futura";
}

/** Próximo marco (fase seguinte) */
export function getProximoMarco(trilha: Trilha): { titulo: string; mesesRestantes: number } | null {
  const mes = getMesAtual();
  const faseAtual = trilha.fases.find((f) => mes >= f.mesInicio && mes <= f.mesFim);
  if (!faseAtual) return null;

  const nextIdx = trilha.fases.indexOf(faseAtual) + 1;
  if (nextIdx >= trilha.fases.length) return null;

  const proxima = trilha.fases[nextIdx];
  return {
    titulo: proxima.titulo,
    mesesRestantes: faseAtual.mesFim - mes + 1,
  };
}

/** Converte mês do projeto para data legível */
export function mesParaLabel(mes: number): string {
  const date = new Date(PROJETO_INICIO);
  date.setMonth(date.getMonth() + mes - 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}
