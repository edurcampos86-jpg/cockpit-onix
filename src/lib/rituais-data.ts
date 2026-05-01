// Rituais de Gestão — Onix Corretora
// Calendário de rituais recorrentes do Projeto T&D

export type Frequencia = "diario" | "semanal" | "mensal" | "trimestral" | "semestral" | "anual";

export type RitualDefinicao = {
  id: string;
  titulo: string;
  descricao: string;
  frequencia: Frequencia;
  diaSemana?: number; // 0=dom, 1=seg ... 6=sab (para semanal)
  diaMes?: number; // 1-28 (para mensal)
  duracao: string; // "5-10 min", "30 min", "1h"
  responsavel: string;
  participantes: string[];
  cor: string;
};

export const RITUAIS: RitualDefinicao[] = [
  {
    id: "micro-coaching",
    titulo: "Micro-coaching",
    descricao: "Conversa rapida individual com cada membro do time sobre o dia anterior",
    frequencia: "diario",
    duracao: "5-10 min",
    responsavel: "Eduardo Campos",
    participantes: ["Rose Oliveira", "Thiago Vergal"],
    cor: "#FFB114",
  },
  {
    id: "relatorio-ecossistema",
    titulo: "Relatorio Ecossistema + Audio",
    descricao: "Envio do relatorio semanal individual com audio personalizado por perfil PAT",
    frequencia: "semanal",
    diaSemana: 5, // sexta
    duracao: "30 min",
    responsavel: "Eduardo Campos",
    participantes: ["Rose Oliveira", "Thiago Vergal"],
    cor: "#0EA5E9",
  },
  {
    id: "reuniao-segunda",
    titulo: "Reuniao de Segunda",
    descricao: "Reuniao coletiva: revisao do ecossistema, padroes da semana, plano de acao",
    frequencia: "semanal",
    diaSemana: 1, // segunda
    duracao: "45 min",
    responsavel: "Eduardo Campos",
    participantes: ["Rose Oliveira", "Thiago Vergal"],
    cor: "#8B5CF6",
  },
  {
    id: "review-mensal",
    titulo: "Review de Indicadores",
    descricao: "Analise mensal de KPIs, metas vs realizado, ajuste de rota",
    frequencia: "mensal",
    diaMes: 1,
    duracao: "1h",
    responsavel: "Eduardo Campos",
    participantes: ["Rose Oliveira", "Thiago Vergal"],
    cor: "#22C55E",
  },
  {
    id: "avaliacao-trimestral",
    titulo: "Avaliacao de Desenvolvimento",
    descricao: "Avaliacao individual de progresso na trilha de desenvolvimento e ajuste de objetivos",
    frequencia: "trimestral",
    duracao: "1h30",
    responsavel: "Eduardo Campos",
    participantes: ["Rose Oliveira", "Thiago Vergal"],
    cor: "#F59E0B",
  },
  {
    id: "review-semestral",
    titulo: "Review Estrategico",
    descricao: "Revisao estrategica com socios: resultados do semestre, roadmap, investimentos",
    frequencia: "semestral",
    duracao: "2h",
    responsavel: "Eduardo Campos",
    participantes: [],
    cor: "#EC4899",
  },
  {
    id: "planejamento-anual",
    titulo: "Planejamento Anual",
    descricao: "Planejamento do proximo ano: metas, trilhas atualizadas, orcamento T&D",
    frequencia: "anual",
    duracao: "4h",
    responsavel: "Eduardo Campos",
    participantes: ["Rose Oliveira", "Thiago Vergal"],
    cor: "#9333EA",
  },
];

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
