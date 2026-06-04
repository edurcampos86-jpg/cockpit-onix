// Trilhas de Desenvolvimento — Onix Corretora (DADO)
// Projeto T&D: Abril 2026 a Março 2031 (5 anos)
// Tipos + dado das trilhas. As FUNÇÕES vivem em @/lib/trilha-data.

export type Fase = {
  numero: number;
  titulo: string;
  mesInicio: number; // mes 1 = abril 2026
  mesFim: number;
  objetivos: string[];
  kpisMeta: Record<string, number>; // meta do KPI nesta fase
};

export type Trilha = {
  vendedor: string;
  cargoAtual: string;
  cargoAlvo: string;
  fases: Fase[];
};

export const TRILHAS: Record<string, Trilha> = {
  "Rose Oliveira": {
    vendedor: "Rose Oliveira",
    cargoAtual: "Assessora Operacional",
    cargoAlvo: "Gestora Operacional",
    fases: [
      {
        numero: 1,
        titulo: "Alivio Operacional",
        mesInicio: 1,
        mesFim: 3,
        objetivos: [
          "Reduzir carga operacional repetitiva com automacoes",
          "Documentar processos do dia a dia",
          "Padronizar fluxo de atendimento no CRM",
        ],
        kpisMeta: { score: 55, taxaResposta: 70, reunioes: 1 },
      },
      {
        numero: 2,
        titulo: "Fortalecimento Tecnico",
        mesInicio: 4,
        mesFim: 8,
        objetivos: [
          "Dominar todos os produtos da corretora",
          "Responder objecoes tecnicas com seguranca",
          "Apresentar simulacoes sem apoio do gestor",
        ],
        kpisMeta: { score: 65, taxaResposta: 80, reunioes: 2 },
      },
      {
        numero: 3,
        titulo: "Comunicacao Assertiva",
        mesInicio: 9,
        mesFim: 14,
        objetivos: [
          "Conduzir conversas de fechamento com autonomia",
          "Adaptar discurso ao perfil do cliente",
          "Manter follow-up estruturado sem lembretes",
        ],
        kpisMeta: { score: 75, taxaResposta: 90, reunioes: 3 },
      },
      {
        numero: 4,
        titulo: "Coordenacao Operacional",
        mesInicio: 15,
        mesFim: 20,
        objetivos: [
          "Coordenar processos de pos-venda",
          "Treinar novos membros em procedimentos",
          "Criar checklists e materiais de apoio",
        ],
        kpisMeta: { score: 80, taxaResposta: 92, reunioes: 3 },
      },
      {
        numero: 5,
        titulo: "Gestao Assistida",
        mesInicio: 21,
        mesFim: 24,
        objetivos: [
          "Tomar decisoes operacionais com autonomia",
          "Gerir indicadores da equipe operacional",
          "Preparar reports mensais para o gestor",
        ],
        kpisMeta: { score: 85, taxaResposta: 95, reunioes: 4 },
      },
    ],
  },
  "Thiago Vergal": {
    vendedor: "Thiago Vergal",
    cargoAtual: "Assessor Comercial",
    cargoAlvo: "Lider Comercial",
    fases: [
      {
        numero: 1,
        titulo: "Dominio Tecnico",
        mesInicio: 1,
        mesFim: 4,
        objetivos: [
          "Dominar portfólio completo de produtos",
          "Usar CRM com disciplina diaria",
          "Atingir taxa de resposta >85% em 24h",
        ],
        kpisMeta: { score: 65, taxaResposta: 85, reunioes: 3 },
      },
      {
        numero: 2,
        titulo: "Autonomia Comercial",
        mesInicio: 5,
        mesFim: 10,
        objetivos: [
          "Conduzir ciclo completo de venda sem supervisao",
          "Gerar 50%+ da receita com clientes proprios",
          "Desenvolver pipeline proprio de prospecção",
        ],
        kpisMeta: { score: 75, taxaResposta: 90, reunioes: 4 },
      },
      {
        numero: 3,
        titulo: "Mentoria Informal",
        mesInicio: 11,
        mesFim: 16,
        objetivos: [
          "Apoiar novos assessores em situacoes praticas",
          "Compartilhar cases e scripts nas reunioes",
          "Manter score consistente acima de 80",
        ],
        kpisMeta: { score: 82, taxaResposta: 92, reunioes: 4 },
      },
      {
        numero: 4,
        titulo: "Lideranca Formal",
        mesInicio: 17,
        mesFim: 24,
        objetivos: [
          "Liderar reunioes de segunda com o time",
          "Definir metas semanais junto ao gestor",
          "Gerir indicadores comerciais do time",
        ],
        kpisMeta: { score: 85, taxaResposta: 95, reunioes: 5 },
      },
    ],
  },
};
