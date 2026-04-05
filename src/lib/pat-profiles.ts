// Perfis PAT do time Onix Corretora
// Dados estáticos usados em badges, calibração de tom e trilha de desenvolvimento

export type PatProfile = {
  nome: string;
  nomeCompleto: string;
  pat: number;
  titulo: string;
  orientacao: string[];
  palavrasChave: string[];
  corPrimaria: string;
  corBg: string;
  emoji: string;
  resumo: string;
  tomRelatorio: string;
};

export const PAT_PROFILES: Record<string, PatProfile> = {
  "Eduardo Campos": {
    nome: "Eduardo",
    nomeCompleto: "Eduardo Campos",
    pat: 76,
    titulo: "Promocional de Acao Livre",
    orientacao: ["Social (81%)", "Conexao Rapida (100%)", "Relacionamento Informal (100%)"],
    palavrasChave: ["Macro", "Relacional", "Rapido", "Entusiasta"],
    corPrimaria: "#FFB114",
    corBg: "#FEF3C7",
    emoji: "EC",
    resumo:
      "Gestor da corretora, perfil macro e relacional. Aprende rapido, perde interesse em rotinas. Precisa de paineis objetivos que cabem em 30 segundos.",
    tomRelatorio:
      "Direto e motivacional. Dados rapidos, celebrar conquistas, foco no impacto.",
  },
  "Rose Oliveira": {
    nome: "Rose",
    nomeCompleto: "Rose Oliveira",
    pat: 118,
    titulo: "Intro-Diligente Livre",
    orientacao: ["Social discreta", "Mantenedora de Acoes (100%)", "Conexao Ponderada (100%)"],
    palavrasChave: ["Cuidadora", "Leal", "Detalhista", "Constante"],
    corPrimaria: "#8B5CF6",
    corBg: "#EDE9FE",
    emoji: "RO",
    resumo:
      "Operacional e leal, cuidadora genuina. Dificuldade com mudancas e tecnologia. Aprende por repeticao e comprovacao pratica.",
    tomRelatorio:
      "Acolhedor. Comecar com acertos, sugerir melhorias como oportunidades, sem pressao. Evitar termos como falha ou erro.",
  },
  "Thiago Vergal": {
    nome: "Thiago",
    nomeCompleto: "Thiago Vergal",
    pat: 22,
    titulo: "Projetista Criativo",
    orientacao: ["Tecnica", "Independente", "Analitico", "Competitivo"],
    palavrasChave: ["Direto", "Tecnico", "Competitivo", "Impaciente"],
    corPrimaria: "#0EA5E9",
    corBg: "#E0F2FE",
    emoji: "TV",
    resumo:
      "Comercial desde nov/2025, acredita que ja sabe. Precisa de contexto logico e exemplos concretos. Risco de turnover alto.",
    tomRelatorio:
      "Direto e baseado em dados. Conectar cada sugestao ao impacto financeiro, sem rodeios. Mostrar progresso na trilha de crescimento.",
  },
};

export function getPatProfile(vendedor: string): PatProfile | null {
  return PAT_PROFILES[vendedor] ?? null;
}

export function getPatBadgeColor(vendedor: string): { text: string; bg: string } {
  const profile = PAT_PROFILES[vendedor];
  if (!profile) return { text: "text-gray-600", bg: "bg-gray-100" };

  const map: Record<string, { text: string; bg: string }> = {
    "Eduardo Campos": { text: "text-amber-700", bg: "bg-amber-50" },
    "Rose Oliveira": { text: "text-violet-700", bg: "bg-violet-50" },
    "Thiago Vergal": { text: "text-sky-700", bg: "bg-sky-50" },
  };
  return map[vendedor] ?? { text: "text-gray-600", bg: "bg-gray-100" };
}
