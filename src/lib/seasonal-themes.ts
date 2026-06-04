/**
 * Motor de Temas Sazonais — Calendário editorial do Projeto Instagram v4
 * Mapeia temas relevantes mês a mês para o público de Eduardo Campos
 * (médicos e profissionais de alta renda em Salvador/BA)
 *
 * O DADO (SEASONAL_THEMES + tipo) vive em @/content/seasonal-themes.
 * Aqui ficam apenas as FUNÇÕES que operam sobre esse dado.
 */

import { SEASONAL_THEMES, type SeasonalTheme } from "@/content/seasonal-themes";

export type { SeasonalTheme };

/**
 * Retorna temas sazonais relevantes para um período de datas
 */
export function getThemesForPeriod(startDate: Date, endDate: Date): SeasonalTheme[] {
  const months = new Set<number>();
  const current = new Date(startDate);
  while (current <= endDate) {
    months.add(current.getMonth() + 1); // 1-12
    current.setMonth(current.getMonth() + 1);
    current.setDate(1);
  }
  // Sempre incluir o mês final
  months.add(endDate.getMonth() + 1);

  return SEASONAL_THEMES.filter((t) => months.has(t.month));
}

/**
 * Retorna o arco mensal para um mês específico
 */
export function getMonthlyArc(month: number): { theme: string; weeklyArcs: string[]; topics: string[] } {
  const seasonal = SEASONAL_THEMES.find((t) => t.month === month);
  if (!seasonal) {
    return { theme: "Blindagem Patrimonial", weeklyArcs: [], topics: [] };
  }
  return { theme: seasonal.theme, weeklyArcs: seasonal.weeklyArcs, topics: seasonal.topics };
}
