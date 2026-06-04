// Rituais de Gestão — Onix Corretora (DADO)
// Calendário de rituais recorrentes do Projeto T&D
// Tipos + dado dos rituais. As FUNÇÕES vivem em @/lib/rituais-data.

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
