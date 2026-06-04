// Roadmap do Projeto T&D — Onix Corretora
// Abril 2026 a Março 2031 (5 anos)
//
// O DADO (ROADMAP + tipos) vive em @/content/roadmap-data.
// Aqui ficam os marcos do projeto e as FUNÇÕES que operam sobre o dado.

import { ROADMAP, type StatusFase, type FaseRoadmap, type AnoRoadmap } from "@/content/roadmap-data";

// Re-exporta o dado/tipos para não quebrar quem importa de @/lib/roadmap-data.
export { ROADMAP };
export type { StatusFase, FaseRoadmap, AnoRoadmap };

export const PROJETO_INICIO = new Date("2026-04-01");
export const PROJETO_FIM = new Date("2031-03-31");

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Mês atual do projeto (1 = abril 2026) */
export function getMesAtualRoadmap(): number {
  const agora = new Date();
  const diffMs = agora.getTime() - PROJETO_INICIO.getTime();
  const diffMeses = diffMs / (1000 * 60 * 60 * 24 * 30.44);
  return Math.max(1, Math.ceil(diffMeses));
}

/** Status de uma fase com base na data atual */
export function getStatusFaseRoadmap(fase: FaseRoadmap): StatusFase {
  const mesAtual = getMesAtualRoadmap();
  if (mesAtual > fase.mesFim) return "concluida";
  if (mesAtual >= fase.mesInicio && mesAtual <= fase.mesFim) return "em_andamento";
  return "nao_iniciada";
}

/** Ano atual do projeto (1-5) */
export function getAnoAtual(): number {
  const mes = getMesAtualRoadmap();
  return Math.min(5, Math.ceil(mes / 12));
}

/** Converte mês do projeto para data legível */
export function mesParaData(mes: number): string {
  const date = new Date(PROJETO_INICIO);
  date.setMonth(date.getMonth() + mes - 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

/** Progresso do projeto inteiro (0-100) */
export function getProgressoProjeto(): number {
  const mes = getMesAtualRoadmap();
  return Math.min(100, Math.round((mes / 60) * 100));
}
