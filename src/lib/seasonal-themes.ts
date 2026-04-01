/**
 * Motor de Temas Sazonais — Calendário editorial do Projeto Instagram v4
 * Mapeia temas relevantes mês a mês para o público de Eduardo Campos
 * (médicos e profissionais de alta renda em Salvador/BA)
 */

export interface SeasonalTheme {
  month: number; // 1-12
  theme: string; // Guarda-chuva do mês
  topics: string[];
  weeklyArcs: string[]; // 4-5 sub-temas semanais para criar sequência
}

export const SEASONAL_THEMES: SeasonalTheme[] = [
  {
    month: 1,
    theme: "Novo Ano, Novo Patrimônio",
    topics: [
      "Planejamento financeiro anual",
      "Metas patrimoniais para o ano",
      "Revisão de carteira pós-ano novo",
      "IPTU e IPVA: planejar ou parcelar?",
      "Organização tributária do médico PJ",
    ],
    weeklyArcs: [
      "Diagnóstico: como está seu patrimônio hoje?",
      "Erros do ano passado que custaram dinheiro",
      "O plano de 12 meses para blindar seu patrimônio",
      "Primeiro passo concreto: o que fazer esta semana",
    ],
  },
  {
    month: 2,
    theme: "Carnaval e Bastidores da Vida Real",
    topics: [
      "Bastidores de carnaval em Salvador",
      "Gastos de carnaval vs. investimentos",
      "Seguro viagem e proteção pessoal",
      "Humanização: vida fora do consultório",
      "O custo invisível de não planejar férias",
    ],
    weeklyArcs: [
      "Salvador em festa: bastidores e conexão pessoal",
      "Quanto custa o carnaval e como planejar sem culpa",
      "Proteja-se: seguro viagem e emergências",
      "Volta à rotina: foco no que importa",
    ],
  },
  {
    month: 3,
    theme: "Trimestre de Ouro: Revisão e Ajuste",
    topics: [
      "Revisão de carteira do 1o trimestre",
      "Rebalanceamento de investimentos",
      "Pro-labore vs. distribuição de lucros médico PJ",
      "Consórcio de plano de saúde: janela de entrada",
      "ITCMD na Bahia: mudanças e impactos",
    ],
    weeklyArcs: [
      "Balanço do 1o trimestre: o que deu certo e o que ajustar",
      "Caso real: médico que perdeu dinheiro por não rebalancear",
      "PJ médica: oportunidades tributárias do trimestre",
      "Alerta: mudanças regulatórias que afetam seu patrimônio",
    ],
  },
  {
    month: 4,
    theme: "Mês do Imposto de Renda",
    topics: [
      "IRPF: erros comuns de médicos na declaração",
      "Dedução de previdência privada (PGBL/VGBL)",
      "Declaração de bens e investimentos",
      "IR para PJ médica: o que muda",
      "Planejamento sucessório e IR: a conexão invisível",
      "Restituição: investir ou gastar?",
    ],
    weeklyArcs: [
      "Semana 1: Os 5 erros que médicos mais cometem no IR",
      "Semana 2: Caso real — cliente que pagou R$40k a mais de imposto",
      "Semana 3: Checklist completo da declaração para alta renda",
      "Semana 4: Alerta deadline — o que fazer nos últimos dias",
    ],
  },
  {
    month: 5,
    theme: "Proteção Familiar e Sucessão",
    topics: [
      "Deadline IRPF: últimos ajustes",
      "Dia das Mães e proteção familiar",
      "Planejamento sucessório para médicos",
      "Seguro de vida resgatável: proteção + investimento",
      "ITCMD na Bahia: simulação com números reais",
      "Holding familiar: quando vale a pena?",
    ],
    weeklyArcs: [
      "Fechamento do IR: lições aprendidas",
      "Dia das Mães: proteger quem você ama é um ato de amor",
      "Caso real: família que evitou R$200k de inventário",
      "O passo a passo do planejamento sucessório",
    ],
  },
  {
    month: 6,
    theme: "Meio do Ano: Patrimônio no Raio-X",
    topics: [
      "Revisão semestral de investimentos",
      "Selic e impacto na renda fixa",
      "Diversificação: além do CDB e Tesouro",
      "Previdência privada: PGBL vs VGBL",
      "Consórcio imobiliário: momento de entrada",
    ],
    weeklyArcs: [
      "Raio-X do semestre: suas metas estão no caminho?",
      "Renda fixa NÃO é segura do jeito que você pensa",
      "Diversificação inteligente para médicos",
      "Alerta: janelas de oportunidade do 2o semestre",
    ],
  },
  {
    month: 7,
    theme: "Férias e Liberdade Financeira",
    topics: [
      "Férias de julho: planejamento inteligente",
      "FIRE para médicos: quanto precisa para parar?",
      "Renda passiva: construindo liberdade",
      "Imóveis como investimento em Salvador",
      "O custo de não ter assessoria financeira",
    ],
    weeklyArcs: [
      "Férias sem culpa: como planejar gastos sem destruir patrimônio",
      "Caso real: médico que conquistou liberdade aos 45",
      "Construindo renda passiva: o caminho prático",
      "Bastidores: minha jornada de 19 anos no mercado",
    ],
  },
  {
    month: 8,
    theme: "Mês dos Pais e Segurança Patrimonial",
    topics: [
      "Dia dos Pais: legado e responsabilidade",
      "Seguro de vida resgatável: por que todo pai precisa",
      "Testamento e inventário: tabus que custam caro",
      "Blindagem patrimonial para profissionais autônomos",
      "O que acontece com seu patrimônio se você faltar amanhã?",
    ],
    weeklyArcs: [
      "Ser pai é proteger: legado financeiro começa agora",
      "Caso real: família que ficou desamparada por falta de planejamento",
      "Seguro de vida: o investimento que protege quem fica",
      "Alerta: 5 erros patrimoniais que pais cometem",
    ],
  },
  {
    month: 9,
    theme: "Primavera Financeira: Renovação",
    topics: [
      "Revisão de seguros e coberturas",
      "Planejamento tributário do último trimestre",
      "Consórcio de plano de saúde: oportunidade",
      "Imóveis em Salvador: tendências do mercado",
      "Cross-sell: integrando proteção e investimento",
    ],
    weeklyArcs: [
      "Primavera financeira: hora de renovar estratégias",
      "Seus seguros estão adequados? Checklist de revisão",
      "Caso real: economia de R$15k/ano com ajuste de cobertura",
      "Planejamento para o último trimestre do ano",
    ],
  },
  {
    month: 10,
    theme: "Reta Final: Aceleração Patrimonial",
    topics: [
      "Último trimestre: janela de PGBL",
      "Black November antecipado: consumo vs. investimento",
      "Balanço anual de patrimônio",
      "Estratégias de fim de ano para PJ médica",
      "Meu Sucesso Patrimonial: método Onix",
    ],
    weeklyArcs: [
      "3 meses para fechar o ano bem: plano de ação",
      "PGBL: a janela que fecha em dezembro",
      "Caso real: médico que economizou R$30k com planejamento tributário",
      "Aceleração: o que ainda dá para fazer este ano",
    ],
  },
  {
    month: 11,
    theme: "Black November: Consumo Inteligente",
    topics: [
      "Black Friday: armadilhas e oportunidades reais",
      "Financiamento vs. consórcio vs. à vista",
      "Compra de imóvel: momento certo?",
      "13o salário: investir ou quitar dívidas?",
      "Revisão final de carteira antes de dezembro",
    ],
    weeklyArcs: [
      "Black Friday para quem pensa em patrimônio",
      "A matemática real: financiar, consorciar ou comprar à vista",
      "Caso real: cliente que transformou 13o em liberdade",
      "Alerta: erros de fim de ano que comprometem janeiro",
    ],
  },
  {
    month: 12,
    theme: "Fechamento e Legado",
    topics: [
      "13o salário: estratégia para investir",
      "PGBL: último mês para dedução fiscal",
      "Retrospectiva patrimonial do ano",
      "Planejamento tributário para janeiro",
      "Gratidão e bastidores: encerramento do ano",
      "Metas patrimoniais para o próximo ano",
    ],
    weeklyArcs: [
      "13o e PGBL: as duas decisões mais importantes de dezembro",
      "Retrospectiva: o que seu patrimônio conquistou este ano",
      "Caso real: de R$0 a R$1MM em 5 anos com disciplina",
      "Bastidores de fim de ano + metas para o próximo ciclo",
    ],
  },
];

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
