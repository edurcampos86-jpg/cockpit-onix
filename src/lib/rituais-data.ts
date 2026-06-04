// Rituais de Gestão — Onix Corretora
// Calendário de rituais recorrentes do Projeto T&D
//
// O DADO (RITUAIS + tipos) vive em @/content/rituais-data.
// Aqui ficam as FUNÇÕES que operam sobre o dado.

import { RITUAIS, type Frequencia, type RitualDefinicao } from "@/content/rituais-data";

// Re-exporta o dado/tipos para não quebrar quem importa de @/lib/rituais-data.
export { RITUAIS };
export type { Frequencia, RitualDefinicao };

// ── Helpers ──────────────────────────────────────────────────────────────────

const FREQ_LABELS: Record<Frequencia, string> = {
  diario: "Diario",
  semanal: "Semanal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const DIAS_SEMANA = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];

export function getFreqLabel(freq: Frequencia): string {
  return FREQ_LABELS[freq];
}

export function getDiaSemanaLabel(dia: number): string {
  return DIAS_SEMANA[dia] || "";
}

/** Gera ocorrências de um ritual para um mês/ano específico */
export function gerarOcorrencias(
  ritual: RitualDefinicao,
  mes: number, // 0-11
  ano: number,
): Date[] {
  const datas: Date[] = [];

  if (ritual.frequencia === "diario") {
    // Dias úteis do mês (seg-sex)
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    for (let d = 1; d <= diasNoMes; d++) {
      const date = new Date(ano, mes, d);
      const dow = date.getDay();
      if (dow >= 1 && dow <= 5) datas.push(date);
    }
  } else if (ritual.frequencia === "semanal" && ritual.diaSemana != null) {
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    for (let d = 1; d <= diasNoMes; d++) {
      const date = new Date(ano, mes, d);
      if (date.getDay() === ritual.diaSemana) datas.push(date);
    }
  } else if (ritual.frequencia === "mensal") {
    const dia = ritual.diaMes ?? 1;
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    datas.push(new Date(ano, mes, Math.min(dia, diasNoMes)));
  } else if (ritual.frequencia === "trimestral") {
    if (mes % 3 === 0) {
      datas.push(new Date(ano, mes, 15));
    }
  } else if (ritual.frequencia === "semestral") {
    if (mes === 3 || mes === 9) {
      datas.push(new Date(ano, mes, 15));
    }
  } else if (ritual.frequencia === "anual") {
    if (mes === 3) {
      datas.push(new Date(ano, mes, 1));
    }
  }

  return datas;
}
