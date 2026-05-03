import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import type { Agent } from "../types";

export const corretoraAgent: Agent = {
  id: "corretora",
  name: "Assistente Corretora",
  subtitle: "Analise comercial · Onix Corretora",
  intro:
    "Ola! Sou seu assistente de analise comercial.\n\nPosso te ajudar a interpretar os dados do time, identificar padroes, sugerir melhorias no processo de analise ou calibrar os prompts para cada perfil PAT.\n\nO que voce quer explorar?",
  suggestions: [
    "Como esta o desempenho do time?",
    "Sugira melhorias para o relatorio do Eduardo",
    "Quais padroes se repetem nas objecoes?",
    "Como calibrar melhor o termometro?",
  ],
  maxTokens: 2048,
  systemPromptBase: `Voce e o Assistente de Analise Comercial da Onix Corretora, especialista em desenvolvimento de equipes de vendas com profundo conhecimento do perfil PAT de cada membro.

EQUIPE:
- Eduardo Campos (PAT 76 — Promocional de Acao Livre): Entusiasmante, focado em pessoas e relacionamentos, lideranca natural. Sugestoes devem ser praticas e imediatas.
- Rose Oliveira (PAT 118 — Intro-Diligente Livre): Cuidadosa, estruturada, precisa de reconhecimento antes de feedback. NUNCA usar urgencia ou comparar com colegas.
- Thiago Vergal (PAT 22 — Projetista Criativo): Objetivo, tecnico, orientado a resultados e metricas. Linguagem direta com dados.

SISTEMA DE RELATORIOS:
Pipeline semanal: busca conversas CRM Datacrazy, analise Claude AI, PDF, Slack.
Relatorio tem 10 blocos: METRICAS, RETOMADA, TERMOMETRO, SECAO 0 (Lente PAT), SECAO 1-5, SCRIPT_SEMANA.
O ecossistema web exibe historico, comparativos, checklist de acoes e pagina de impressao.

Voce pode:
- Analisar tendencias e padroes nos dados do time
- Interpretar metricas e comparar entre semanas
- Sugerir melhorias nos prompts de analise (formato blocos ===)
- Calibrar abordagem por perfil PAT
- Propor ajustes no sistema de acompanhamento

Responda em portugues, de forma direta. Use markdown para estruturar respostas longas. Para sugestoes de prompt, use blocos de codigo.`,

  loadContext: async () => {
    try {
      const relatorios = await prisma.relatorio.findMany({
        orderBy: { periodoInicio: "desc" },
        take: 6,
        include: {
          acoes: { select: { id: true, concluida: true } },
          metricas: true,
        },
      });

      const totalPendentes = await prisma.acao.count({
        where: { concluida: false },
      });

      if (relatorios.length === 0) {
        return "DADOS RECENTES: Nenhum relatorio gerado ainda.";
      }

      const linhas = relatorios.map((r) => {
        const acoesConcluidas = r.acoes.filter((a) => a.concluida).length;
        const acoesTotal = r.acoes.length;
        const score = r.metricas?.score ?? 0;
        const periodoFmt =
          format(r.periodoInicio, "dd/MM", { locale: ptBR }) +
          " a " +
          format(r.periodoFim, "dd/MM/yyyy", { locale: ptBR });
        return `${r.vendedor} (${periodoFmt}): ${r.conversasAnalisadas} conversas, score ${score}, ${acoesConcluidas}/${acoesTotal} acoes concluidas`;
      });

      return `DADOS RECENTES:\n${linhas.join("\n")}\nTOTAL ACOES PENDENTES: ${totalPendentes}`;
    } catch {
      return "DADOS RECENTES: Nao foi possivel carregar dados do banco.";
    }
  },
};
