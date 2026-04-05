// Roadmap do Projeto T&D — Onix Corretora
// Abril 2026 a Março 2031 (5 anos)

export const PROJETO_INICIO = new Date("2026-04-01");
export const PROJETO_FIM = new Date("2031-03-31");

export type StatusFase = "nao_iniciada" | "em_andamento" | "concluida" | "atrasada";

export type FaseRoadmap = {
  id: string;
  titulo: string;
  descricao: string;
  mesInicio: number; // 1 = abril 2026
  mesFim: number;
  ano: number; // 1 a 5
  entregas: string[];
  cor: string;
};

export type AnoRoadmap = {
  numero: number;
  titulo: string;
  subtitulo: string;
  cor: string;
  fases: FaseRoadmap[];
};

export const ROADMAP: AnoRoadmap[] = [
  {
    numero: 1,
    titulo: "Fundacao",
    subtitulo: "Implantar ciclo de gestao semanal e processos basicos",
    cor: "#FFB114",
    fases: [
      {
        id: "1-1",
        titulo: "MVP — Ciclo Cockpit",
        descricao: "Implantar ciclo semanal: cockpit + reuniao de segunda",
        mesInicio: 1,
        mesFim: 1,
        ano: 1,
        entregas: [
          "Pipeline Python gerando relatorios semanais",
          "Cockpit web com dashboard e relatorios",
          "Painel Semanal para segunda-feira",
          "Reuniao de segunda com Formato C",
        ],
        cor: "#FFB114",
      },
      {
        id: "1-2",
        titulo: "Pos-venda no CRM",
        descricao: "Estruturar processo de pos-venda no Datacrazy",
        mesInicio: 2,
        mesFim: 2,
        ano: 1,
        entregas: [
          "Pipeline de pos-venda configurado no CRM",
          "Fluxo de acompanhamento apos fechamento",
          "Alertas de satisfacao do cliente",
        ],
        cor: "#FFB114",
      },
      {
        id: "1-3",
        titulo: "Reciclagem de Leads",
        descricao: "Reativar negocios adormecidos com processo estruturado",
        mesInicio: 3,
        mesFim: 3,
        ano: 1,
        entregas: [
          "Sistema de alertas de pipeline parado",
          "Templates de reativacao por motivo de perda",
          "Agenda de recontato automatica (60 dias)",
        ],
        cor: "#FFB114",
      },
      {
        id: "1-4",
        titulo: "Documentacao de Processos",
        descricao: "Gravar e documentar processos com Rose + IA",
        mesInicio: 4,
        mesFim: 5,
        ano: 1,
        entregas: [
          "Gravacoes de processos operacionais (Plaud)",
          "Transcricoes e resumos gerados por IA",
          "Checklists de procedimentos padrao",
        ],
        cor: "#FFB114",
      },
      {
        id: "1-5",
        titulo: "Reformulacao de Metas",
        descricao: "Nova formula: 70% receita + 30% processo",
        mesInicio: 6,
        mesFim: 6,
        ano: 1,
        entregas: [
          "Modelo de metas hibrido implementado",
          "Dashboard de acompanhamento de metas",
          "Criterios de processo definidos e medidos",
        ],
        cor: "#FFB114",
      },
      {
        id: "1-6",
        titulo: "Prospeccao Ativa",
        descricao: "Iniciar prospeccao propria alem de leads recebidos",
        mesInicio: 7,
        mesFim: 9,
        ano: 1,
        entregas: [
          "Processo de prospeccao documentado",
          "Meta de leads proprios por assessor",
          "Tracking de fonte no pipeline",
        ],
        cor: "#FFB114",
      },
      {
        id: "1-7",
        titulo: "Kit Assessores + Avaliacao",
        descricao: "Material de apoio padronizado e primeira avaliacao anual",
        mesInicio: 10,
        mesFim: 12,
        ano: 1,
        entregas: [
          "Kit do assessor (scripts, FAQs, simuladores)",
          "Avaliacao anual de desempenho",
          "Plano individual atualizado para Ano 2",
        ],
        cor: "#FFB114",
      },
    ],
  },
  {
    numero: 2,
    titulo: "Estruturacao",
    subtitulo: "Prospeccao, gestao Rose, saude financeira, trilha Thiago",
    cor: "#0EA5E9",
    fases: [
      {
        id: "2-1",
        titulo: "Prospeccao Estruturada",
        descricao: "Ampliar e consolidar processo de captacao propria",
        mesInicio: 13,
        mesFim: 15,
        ano: 2,
        entregas: [
          "Canal de prospeccao ativa consolidado",
          "30%+ dos leads vindo de captacao propria",
          "Funil de prospecção no CRM",
        ],
        cor: "#0EA5E9",
      },
      {
        id: "2-2",
        titulo: "Rose: Coordenacao",
        descricao: "Rose assume coordenacao operacional assistida",
        mesInicio: 16,
        mesFim: 18,
        ano: 2,
        entregas: [
          "Rose coordenando processos de pos-venda",
          "Treinamento de novos membros por Rose",
          "Reports operacionais preparados por Rose",
        ],
        cor: "#8B5CF6",
      },
      {
        id: "2-3",
        titulo: "Saude Financeira",
        descricao: "Indicadores de saude da carteira e retencao",
        mesInicio: 19,
        mesFim: 21,
        ano: 2,
        entregas: [
          "Dashboard de retencao de clientes",
          "Processo de cross-sell estruturado",
          "Meta de receita recorrente definida",
        ],
        cor: "#0EA5E9",
      },
      {
        id: "2-4",
        titulo: "Thiago: Mentoria",
        descricao: "Thiago inicia mentoria informal de novos assessores",
        mesInicio: 22,
        mesFim: 24,
        ano: 2,
        entregas: [
          "Thiago apoiando novos membros em campo",
          "Compartilhamento de cases nas reunioes",
          "Score consistente acima de 80",
        ],
        cor: "#0EA5E9",
      },
    ],
  },
  {
    numero: 3,
    titulo: "Independencia",
    subtitulo: "50%+ receita propria, Rose gestora, Thiago lider",
    cor: "#22C55E",
    fases: [
      {
        id: "3-1",
        titulo: "Receita Propria 50%",
        descricao: "Metade da receita vinda de clientes captados pela equipe",
        mesInicio: 25,
        mesFim: 30,
        ano: 3,
        entregas: [
          "50%+ da receita de captacao propria",
          "Pipeline autonomo e previsivel",
          "Processo de venda replicavel",
        ],
        cor: "#22C55E",
      },
      {
        id: "3-2",
        titulo: "Rose Gestora Operacional",
        descricao: "Rose assume gestao operacional com autonomia",
        mesInicio: 25,
        mesFim: 36,
        ano: 3,
        entregas: [
          "Rose gerindo indicadores operacionais",
          "Decisoes operacionais sem supervisao",
          "Onboarding de novos membros liderado por Rose",
        ],
        cor: "#8B5CF6",
      },
      {
        id: "3-3",
        titulo: "Thiago Lider Comercial",
        descricao: "Thiago assume lideranca formal do time comercial",
        mesInicio: 31,
        mesFim: 36,
        ano: 3,
        entregas: [
          "Thiago liderando reunioes de segunda",
          "Definicao de metas junto ao gestor",
          "Gestao de indicadores comerciais",
        ],
        cor: "#0EA5E9",
      },
    ],
  },
  {
    numero: 4,
    titulo: "Escala",
    subtitulo: "Replicar modelo para outros departamentos",
    cor: "#F59E0B",
    fases: [
      {
        id: "4-1",
        titulo: "Documentacao do Modelo",
        descricao: "Documentar o modelo T&D para replicacao",
        mesInicio: 37,
        mesFim: 42,
        ano: 4,
        entregas: [
          "Playbook do modelo T&D completo",
          "Templates de trilhas adaptaveis",
          "Metricas de sucesso documentadas",
        ],
        cor: "#F59E0B",
      },
      {
        id: "4-2",
        titulo: "Piloto em Outro Departamento",
        descricao: "Aplicar modelo em um segundo departamento",
        mesInicio: 43,
        mesFim: 48,
        ano: 4,
        entregas: [
          "Segundo departamento usando o cockpit",
          "Trilhas de desenvolvimento customizadas",
          "Ciclo semanal funcionando autonomamente",
        ],
        cor: "#F59E0B",
      },
    ],
  },
  {
    numero: 5,
    titulo: "Excelencia",
    subtitulo: "Cultura autogerida de desenvolvimento continuo",
    cor: "#EC4899",
    fases: [
      {
        id: "5-1",
        titulo: "Cultura Autogerida",
        descricao: "Time mantém ciclo de melhoria sem intervencao externa",
        mesInicio: 49,
        mesFim: 54,
        ano: 5,
        entregas: [
          "Reunioes de segunda auto-conduzidas pelo time",
          "Planos de acao gerados internamente",
          "Novos membros integrados pelo proprio time",
        ],
        cor: "#EC4899",
      },
      {
        id: "5-2",
        titulo: "Modelo de Referencia",
        descricao: "Onix como referencia em T&D no setor",
        mesInicio: 55,
        mesFim: 60,
        ano: 5,
        entregas: [
          "Case de sucesso documentado",
          "Modelo replicado em 2+ departamentos",
          "Indicadores de excelencia alcancados",
        ],
        cor: "#EC4899",
      },
    ],
  },
];

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
