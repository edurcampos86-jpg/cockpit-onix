import "server-only";
import { prisma } from "@/lib/prisma";
import { claudeChat } from "./claude-helpers";

/**
 * Sug 5 — Retrospectiva semanal.
 *
 * Gera snapshot da semana terminada no domingo passado. Métricas:
 *  - Ações encerradas por quadrante + tempo total
 *  - Saúde Supernova: clientes A/B fora de cadência
 *  - Dívida: ações zumbi (>14 dias no painel, não concluídas)
 *  - Top 5 clientes por tempo investido
 *  - Insight textual gerado pelo Claude
 */
export type RetrospectivaMetricas = {
  totalEncerradas: number;
  porQuadrante: Record<"Q1" | "Q2" | "Q3" | "Q4" | "semQ", { count: number; tempoMin: number }>;
  tempoTotalMin: number;
  tempoMedioEncerramentoHoras: number;
  saudeSupernova: {
    aFora: Array<{ id: string; nome: string; diasSemContato: number }>;
    bFora: Array<{ id: string; nome: string; diasSemContato: number }>;
  };
  zumbis: Array<{ id: string; titulo: string; idadeDias: number }>;
  topClientes: Array<{ id: string; nome: string; tempoMin: number }>;
};

function segundaFimDeSemanaPassada(): { inicio: Date; fim: Date } {
  // Bahia = UTC-3; calculamos em UTC por conveniencia
  const agora = new Date();
  const diaSemana = agora.getUTCDay(); // 0=dom, 1=seg ...
  // diasParaDomingoPassado: 0=dom->7, 1=seg->1, 2=ter->2 ...
  const diasAteDomingoPassado = diaSemana === 0 ? 7 : diaSemana;
  const fim = new Date(agora);
  fim.setUTCDate(agora.getUTCDate() - diasAteDomingoPassado);
  fim.setUTCHours(23, 59, 59, 999);
  const inicio = new Date(fim);
  inicio.setUTCDate(fim.getUTCDate() - 6);
  inicio.setUTCHours(0, 0, 0, 0);
  return { inicio, fim };
}

export async function coletarMetricas(userId: string): Promise<{
  semanaInicio: Date;
  semanaFim: Date;
  metricas: RetrospectivaMetricas;
}> {
  const { inicio, fim } = segundaFimDeSemanaPassada();

  const [encerradas, clientes, abertas] = await Promise.all([
    prisma.acaoPainel.findMany({
      where: {
        userId,
        concluida: true,
        concluidaEm: { gte: inicio, lte: fim },
      },
      include: { clienteVinculado: { select: { id: true, nome: true } } },
    }),
    prisma.clienteBackoffice.findMany({
      where: { OR: [{ classificacao: "A" }, { classificacao: "B" }] },
      select: {
        id: true,
        nome: true,
        classificacao: true,
        ultimoContatoAt: true,
      },
    }),
    prisma.acaoPainel.findMany({
      where: { userId, concluida: false },
      select: { id: true, titulo: true, createdAt: true },
    }),
  ]);

  const porQuadrante: RetrospectivaMetricas["porQuadrante"] = {
    Q1: { count: 0, tempoMin: 0 },
    Q2: { count: 0, tempoMin: 0 },
    Q3: { count: 0, tempoMin: 0 },
    Q4: { count: 0, tempoMin: 0 },
    semQ: { count: 0, tempoMin: 0 },
  };
  let tempoTotal = 0;
  let somaTempoEncerramentoMs = 0;
  const tempoPorCliente = new Map<string, { nome: string; tempoMin: number }>();

  for (const a of encerradas) {
    const q = (a.quadrante as "Q1" | "Q2" | "Q3" | "Q4" | null) ?? "semQ";
    const bucket = porQuadrante[q];
    bucket.count++;
    const t = a.tempoGastoMin ?? 0;
    bucket.tempoMin += t;
    tempoTotal += t;
    if (a.concluidaEm) {
      somaTempoEncerramentoMs += a.concluidaEm.getTime() - a.createdAt.getTime();
    }
    if (a.clienteVinculadoId && a.clienteVinculado) {
      const prev = tempoPorCliente.get(a.clienteVinculadoId) ?? {
        nome: a.clienteVinculado.nome,
        tempoMin: 0,
      };
      prev.tempoMin += t;
      tempoPorCliente.set(a.clienteVinculadoId, prev);
    }
  }

  const tempoMedioEncerramentoHoras =
    encerradas.length > 0
      ? Math.round(somaTempoEncerramentoMs / encerradas.length / (1000 * 60 * 60))
      : 0;

  const DIA = 24 * 60 * 60 * 1000;
  const agora = Date.now();
  const aFora: RetrospectivaMetricas["saudeSupernova"]["aFora"] = [];
  const bFora: RetrospectivaMetricas["saudeSupernova"]["bFora"] = [];
  for (const c of clientes) {
    if (!c.ultimoContatoAt) {
      (c.classificacao === "A" ? aFora : bFora).push({
        id: c.id,
        nome: c.nome,
        diasSemContato: 999,
      });
      continue;
    }
    const dias = Math.floor((agora - c.ultimoContatoAt.getTime()) / DIA);
    if (c.classificacao === "A" && dias > 30) {
      aFora.push({ id: c.id, nome: c.nome, diasSemContato: dias });
    } else if (c.classificacao === "B" && dias > 60) {
      bFora.push({ id: c.id, nome: c.nome, diasSemContato: dias });
    }
  }

  const zumbis = abertas
    .map((a) => ({
      id: a.id,
      titulo: a.titulo,
      idadeDias: Math.floor((agora - a.createdAt.getTime()) / DIA),
    }))
    .filter((a) => a.idadeDias > 14)
    .sort((a, b) => b.idadeDias - a.idadeDias)
    .slice(0, 10);

  const topClientes = Array.from(tempoPorCliente.entries())
    .map(([id, v]) => ({ id, nome: v.nome, tempoMin: v.tempoMin }))
    .sort((a, b) => b.tempoMin - a.tempoMin)
    .slice(0, 5);

  return {
    semanaInicio: inicio,
    semanaFim: fim,
    metricas: {
      totalEncerradas: encerradas.length,
      porQuadrante,
      tempoTotalMin: tempoTotal,
      tempoMedioEncerramentoHoras,
      saudeSupernova: { aFora: aFora.slice(0, 10), bFora: bFora.slice(0, 10) },
      zumbis,
      topClientes,
    },
  };
}

export async function gerarInsight(
  metricas: RetrospectivaMetricas
): Promise<string> {
  const q = metricas.porQuadrante;
  const total = q.Q1.tempoMin + q.Q2.tempoMin + q.Q3.tempoMin + q.Q4.tempoMin;
  const pctQ1 = total > 0 ? Math.round((q.Q1.tempoMin * 100) / total) : 0;
  const pctQ2 = total > 0 ? Math.round((q.Q2.tempoMin * 100) / total) : 0;

  const resumo = [
    `Ações encerradas: ${metricas.totalEncerradas}`,
    `Tempo total: ${Math.round(metricas.tempoTotalMin / 60)}h`,
    `Distribuição: Q1 ${pctQ1}%, Q2 ${pctQ2}%, Q3 ${q.Q3.count}, Q4 ${q.Q4.count}`,
    `Clientes A fora de cadência (>30d): ${metricas.saudeSupernova.aFora.length}`,
    `Clientes B fora de cadência (>60d): ${metricas.saudeSupernova.bFora.length}`,
    `Ações zumbi (>14d sem mover): ${metricas.zumbis.length}`,
  ].join(" · ");

  const clientesStr = metricas.saudeSupernova.aFora
    .slice(0, 3)
    .map((c) => `${c.nome} (${c.diasSemContato}d)`)
    .join(", ");

  try {
    return await claudeChat({
      system:
        "Voce eh um coach de produtividade direto ao ponto. Fala portugues do Brasil, de forma objetiva, sem jargao. Responde em 4 linhas no maximo.",
      user: `Dados da semana anterior do Eduardo:
${resumo}
${clientesStr ? `Clientes A fora: ${clientesStr}` : ""}

Metodologia:
- Eisenhower: Q1=urgente+importante, Q2=importante+nao-urgente, Q3=urgente+nao-importante, Q4=rotina
- Supernova: cliente A = contato a cada 30d, cliente B = 60d
- Meta: idealmente 40%+ do tempo em Q2 (trabalho estrategico)

Escreva um insight curto (max 4 linhas) em primeira pessoa, com:
1. Diagnostico da semana (tom honesto, nao apaziguador)
2. 1 acao concreta para a semana que entra
Comece direto, sem "Semana passada..." nem saudacoes.`,
      maxTokens: 400,
    });
  } catch {
    return `${resumo}. ${
      pctQ1 > 60
        ? "Muito tempo em Q1 (reativo). Reserve 2 blocos de Q2 esta semana."
        : pctQ2 > 40
        ? "Boa alocação em Q2. Mantenha o ritmo."
        : "Reequilibre: aumente tempo em Q2 (estratégico) na proxima semana."
    }`;
  }
}

export async function gerarRetrospectiva(userId: string): Promise<{
  id: string;
  ja_existia: boolean;
}> {
  const { semanaInicio, semanaFim, metricas } = await coletarMetricas(userId);

  const existente = await prisma.painelRetrospectiva.findUnique({
    where: { userId_semanaInicio: { userId, semanaInicio } },
  });
  if (existente) {
    return { id: existente.id, ja_existia: true };
  }

  const insight = await gerarInsight(metricas);

  const criada = await prisma.painelRetrospectiva.create({
    data: {
      userId,
      semanaInicio,
      semanaFim,
      metricas: metricas as unknown as object,
      insight,
    },
  });

  return { id: criada.id, ja_existia: false };
}
