/**
 * Referências bibliográficas centralizadas.
 * Cada funcionalidade do módulo de assessoria do backoffice está ancorada
 * em um ou mais dos quatro livros-base do método Supernova + Storyselling.
 *
 * Livros:
 *  - Marketing for Financial Advisors — Eric T. Bradlow / Halloran
 *  - Storyselling for Financial Advisors — Scott West & Mitch Anthony
 *  - Supernova Advisor Teams — Rob Knapp & equipe
 *  - The Supernova Advisor — Rob Knapp
 */

export interface Referencia {
  livro: string;
  autor: string;
  conceito: string;
  explicacao: string;
  citacao?: string;
}

export const REF_CLASSIFICACAO_ABC: Referencia[] = [
  {
    livro: "The Supernova Advisor",
    autor: "Rob Knapp",
    conceito: "Segmentação de clientes (Top 100)",
    explicacao:
      "O modelo Supernova propõe segmentar a base em clientes A, B e C. O assessor foca em um núcleo de clientes A (tipicamente os top 100 por ativos/receita) para entregar serviço excepcional e aprofundar relacionamento. Clientes B e C recebem nível de serviço compatível com seu potencial.",
    citacao:
      "Concentrate on your top 100 clients and deliver a level of service that will be unforgettable.",
  },
  {
    livro: "Supernova Advisor Teams",
    autor: "Rob Knapp et al.",
    conceito: "A regra do ponto de equilíbrio de serviço",
    explicacao:
      "A equipe Supernova rebalanceia a base periodicamente: clientes C que não crescem são transferidos ou recebem serviço escalado, liberando capacidade para expandir a base A. Classificação ABC é o primeiro passo desse rebalanceamento.",
  },
];

export const REF_CADENCIA_12_4_2: Referencia[] = [
  {
    livro: "The Supernova Advisor",
    autor: "Rob Knapp",
    conceito: "A cadência 12-4-2",
    explicacao:
      "Para cada cliente A, o assessor Supernova se compromete com 12 contatos ao ano: 12 ligações mensais, 4 reuniões presenciais (trimestrais) e 2 revisões formais de planejamento. Essa disciplina de contato é o coração da 'promessa de serviço' que justifica a retenção premium.",
    citacao:
      "Twelve contacts a year is the foundation of the Supernova service promise.",
  },
  {
    livro: "Supernova Advisor Teams",
    autor: "Rob Knapp et al.",
    conceito: "Calendário de serviço antecipado",
    explicacao:
      "O calendário 12-4-2 é planejado com antecedência de 12 meses. O assessor marca as reuniões trimestrais já no início do ano para garantir execução e previsibilidade.",
  },
];

export const REF_PROMESSA_SERVICO: Referencia[] = [
  {
    livro: "The Supernova Advisor",
    autor: "Rob Knapp",
    conceito: "The Service Promise",
    explicacao:
      "A 'promessa de serviço' é o contrato implícito entre o assessor e o cliente A: reuniões trimestrais, revisão anual, retorno de ligações em até 24h, pró-atividade em eventos de mercado. O dashboard mostra quantos clientes estão recebendo a promessa que foi prometida.",
    citacao:
      "If you promise it, measure it. If you measure it, you will deliver it.",
  },
];

export const REF_CLIENTES_ORFAOS: Referencia[] = [
  {
    livro: "The Supernova Advisor",
    autor: "Rob Knapp",
    conceito: "Clientes órfãos (Orphan Clients)",
    explicacao:
      "Clientes que ficam sem contato por mais tempo do que a cadência definida para sua classe são 'órfãos' — têm alto risco de evasão. O sistema Supernova identifica esses clientes e prioriza recontato imediato antes que a relação esfrie.",
  },
  {
    livro: "Marketing for Financial Advisors",
    autor: "Eric Bradlow / Halloran",
    conceito: "Custo de perder um cliente ativo",
    explicacao:
      "Estudos citados no livro mostram que adquirir um novo cliente custa 5 a 7 vezes mais do que reter um existente. O monitoramento de órfãos é, na prática, o principal mecanismo de retenção do assessor.",
  },
];

export const REF_DESCOBERTA_PROFUNDA: Referencia[] = [
  {
    livro: "Storyselling for Financial Advisors",
    autor: "Scott West & Mitch Anthony",
    conceito: "Hemisfério direito — descoberta emocional",
    explicacao:
      "Storyselling sustenta que decisões financeiras são tomadas no hemisfério direito do cérebro (emoções, histórias, imagens) e só depois racionalizadas. A descoberta profunda precisa capturar medos, sonhos e a linguagem do cliente, não apenas dados de suitability.",
    citacao:
      "People don't buy what they don't understand, and they don't understand what doesn't connect emotionally.",
  },
];

export const REF_ONE_PAGE_PLAN: Referencia[] = [
  {
    livro: "The Supernova Advisor",
    autor: "Rob Knapp",
    conceito: "One-Page Financial Plan",
    explicacao:
      "O Supernova propõe consolidar todo o plano do cliente em uma única página visual. A simplicidade força clareza e serve como instrumento de conversação nas reuniões trimestrais — o cliente entende e relembra seu plano.",
  },
];

export const REF_STORY_ANALOGIAS: Referencia[] = [
  {
    livro: "Storyselling for Financial Advisors",
    autor: "Scott West & Mitch Anthony",
    conceito: "Biblioteca de analogias",
    explicacao:
      "Storyselling é baseado em analogias memoráveis: o guarda-chuva (seguros), a árvore que cresce (juros compostos), a arca de Noé (diversificação). O assessor mantém uma biblioteca pessoal dessas histórias e escolhe a certa para cada contexto de cliente.",
  },
];

export const REF_RCA: Referencia[] = [
  {
    livro: "The Supernova Advisor",
    autor: "Rob Knapp",
    conceito: "Rapid Client Assessment (RCA)",
    explicacao:
      "O RCA é um roteiro estruturado de 30-45 minutos usado nas reuniões trimestrais com clientes A: revisa metas, mudanças de vida, alocação atual, pendências e próximos passos. É o instrumento que dá consistência às reuniões trimestrais.",
  },
];

export const REF_INDICACOES: Referencia[] = [
  {
    livro: "Marketing for Financial Advisors",
    autor: "Eric Bradlow / Halloran",
    conceito: "Referral-based growth",
    explicacao:
      "O livro demonstra que a principal alavanca de crescimento do assessor é o referral qualificado vindo de clientes satisfeitos. Um CRM de indicações rastreia cada indicação do momento em que chega até a conversão — e garante que o agradecimento aconteça.",
  },
  {
    livro: "The Supernova Advisor",
    autor: "Rob Knapp",
    conceito: "Clientes A geram clientes A",
    explicacao:
      "Supernova argumenta que a melhor fonte de novos clientes A são os próprios clientes A existentes. Pedir indicações é parte do processo de reunião trimestral.",
  },
];

export const REF_KPI_EXCELENCIA: Referencia[] = [
  {
    livro: "Supernova Advisor Teams",
    autor: "Rob Knapp et al.",
    conceito: "Painel de excelência operacional",
    explicacao:
      "A equipe Supernova monitora semanalmente: nº de reuniões, % de clientes A atendidos, ativos captados, indicações recebidas e NPS. Esses KPIs são o 'painel do voo' do assessor.",
  },
];
