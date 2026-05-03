import "server-only";
import { prisma } from "@/lib/prisma";

export interface WeeklySnapshot {
  geradoEm: string;
  janelaAtual: { inicio: string; fim: string };
  janelaAnterior: { inicio: string; fim: string };
  posts: {
    publicadosAtual: number;
    publicadosAnterior: number;
    agendadosProximos7d: number;
    rascunhosPendentes: number;
    porCategoriaAtual: Record<string, number>;
    porCtaAtual: Record<string, number>;
  };
  leads: {
    novosAtual: number;
    novosAnterior: number;
    totalAtivos: number;
    porStage: Record<string, number>;
    porTemperatura: Record<string, number>;
    perdidosAtual: number;
  };
  corretora: {
    relatoriosAtual: number;
    relatoriosAnterior: number;
    scoresUltimos: Array<{ vendedor: string; score: number; periodo: string }>;
    acoesPendentes: number;
    acoesConcluidasAtual: number;
    reunioesAgendadasAtual: number;
    conversasAnalisadasAtual: number;
  };
  tarefas: {
    pendentes: number;
    concluidasAtual: number;
    atrasadas: number;
  };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function collectWeeklySnapshot(now = new Date()): Promise<WeeklySnapshot> {
  const today = startOfDay(now);
  const sevenAgo = new Date(today);
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const fourteenAgo = new Date(today);
  fourteenAgo.setDate(fourteenAgo.getDate() - 14);
  const sevenAhead = new Date(today);
  sevenAhead.setDate(sevenAhead.getDate() + 7);

  const [
    publicadosAtual,
    publicadosAnterior,
    agendadosProximos,
    rascunhos,
    postsAtuaisRaw,
    novosLeadsAtual,
    novosLeadsAnterior,
    totalAtivos,
    leadsRaw,
    perdidosAtual,
    relatoriosAtual,
    relatoriosAnterior,
    relatoriosUltimos,
    acoesPendentes,
    acoesConcluidasAtual,
    metricasAtual,
    tarefasPendentes,
    tarefasConcluidasAtual,
    tarefasAtrasadas,
  ] = await Promise.all([
    prisma.post.count({
      where: { status: "publicado", publishedAt: { gte: sevenAgo, lt: today } },
    }),
    prisma.post.count({
      where: { status: "publicado", publishedAt: { gte: fourteenAgo, lt: sevenAgo } },
    }),
    prisma.post.count({
      where: { status: { in: ["agendado", "editado", "gravado"] }, scheduledDate: { gte: today, lt: sevenAhead } },
    }),
    prisma.post.count({
      where: { status: { in: ["rascunho", "roteiro_pronto"] } },
    }),
    prisma.post.findMany({
      where: { status: "publicado", publishedAt: { gte: sevenAgo, lt: today } },
      select: { category: true, ctaType: true },
    }),
    prisma.lead.count({
      where: { enteredAt: { gte: sevenAgo, lt: today } },
    }),
    prisma.lead.count({
      where: { enteredAt: { gte: fourteenAgo, lt: sevenAgo } },
    }),
    prisma.lead.count({
      where: { stage: { notIn: ["perdido", "ganho", "convertido"] } },
    }),
    prisma.lead.findMany({
      select: { stage: true, temperature: true },
      where: { stage: { notIn: ["perdido", "ganho", "convertido"] } },
    }),
    prisma.lead.count({
      where: { stage: "perdido", updatedAt: { gte: sevenAgo, lt: today } },
    }),
    prisma.relatorio.count({
      where: { dataExecucao: { gte: sevenAgo, lt: today } },
    }),
    prisma.relatorio.count({
      where: { dataExecucao: { gte: fourteenAgo, lt: sevenAgo } },
    }),
    prisma.relatorio.findMany({
      orderBy: { dataExecucao: "desc" },
      take: 6,
      include: { metricas: true },
    }),
    prisma.acao.count({
      where: { concluida: false },
    }),
    prisma.acao.count({
      where: { concluida: true, concluidaEm: { gte: sevenAgo, lt: today } },
    }),
    prisma.metrica.findMany({
      where: { createdAt: { gte: sevenAgo, lt: today } },
      select: { reunioesAgendadas: true, conversasAnalisadas: true },
    }),
    prisma.task.count({
      where: { status: { in: ["pendente", "em_progresso"] } },
    }),
    prisma.task.count({
      where: { status: "concluida", completedAt: { gte: sevenAgo, lt: today } },
    }),
    prisma.task.count({
      where: { status: { in: ["pendente", "em_progresso"] }, dueDate: { lt: today } },
    }),
  ]);

  const porCategoriaAtual: Record<string, number> = {};
  const porCtaAtual: Record<string, number> = {};
  for (const p of postsAtuaisRaw) {
    porCategoriaAtual[p.category] = (porCategoriaAtual[p.category] ?? 0) + 1;
    const cta = p.ctaType ?? "sem_cta";
    porCtaAtual[cta] = (porCtaAtual[cta] ?? 0) + 1;
  }

  const porStage: Record<string, number> = {};
  const porTemperatura: Record<string, number> = {};
  for (const l of leadsRaw) {
    porStage[l.stage] = (porStage[l.stage] ?? 0) + 1;
    porTemperatura[l.temperature] = (porTemperatura[l.temperature] ?? 0) + 1;
  }

  const reunioesAgendadasAtual = metricasAtual.reduce((s, m) => s + m.reunioesAgendadas, 0);
  const conversasAnalisadasAtual = metricasAtual.reduce((s, m) => s + m.conversasAnalisadas, 0);

  const scoresUltimos = relatoriosUltimos
    .filter((r) => r.metricas)
    .map((r) => ({
      vendedor: r.vendedor,
      score: r.metricas!.score,
      periodo: r.periodo,
    }));

  return {
    geradoEm: new Date().toISOString(),
    janelaAtual: { inicio: sevenAgo.toISOString(), fim: today.toISOString() },
    janelaAnterior: { inicio: fourteenAgo.toISOString(), fim: sevenAgo.toISOString() },
    posts: {
      publicadosAtual,
      publicadosAnterior,
      agendadosProximos7d: agendadosProximos,
      rascunhosPendentes: rascunhos,
      porCategoriaAtual,
      porCtaAtual,
    },
    leads: {
      novosAtual: novosLeadsAtual,
      novosAnterior: novosLeadsAnterior,
      totalAtivos,
      porStage,
      porTemperatura,
      perdidosAtual,
    },
    corretora: {
      relatoriosAtual,
      relatoriosAnterior,
      scoresUltimos,
      acoesPendentes,
      acoesConcluidasAtual,
      reunioesAgendadasAtual,
      conversasAnalisadasAtual,
    },
    tarefas: {
      pendentes: tarefasPendentes,
      concluidasAtual: tarefasConcluidasAtual,
      atrasadas: tarefasAtrasadas,
    },
  };
}

export function snapshotToContextBlock(snap: WeeklySnapshot): string {
  const fmtDate = (iso: string) => iso.slice(0, 10);
  const lines: string[] = [];
  lines.push("## SNAPSHOT SEMANAL (DADOS REAIS DO BANCO)");
  lines.push(
    `**Janela atual:** ${fmtDate(snap.janelaAtual.inicio)} a ${fmtDate(snap.janelaAtual.fim)} (7d)`
  );
  lines.push(
    `**Janela anterior:** ${fmtDate(snap.janelaAnterior.inicio)} a ${fmtDate(snap.janelaAnterior.fim)} (7d)`
  );
  lines.push("");
  lines.push("### MKT — Instagram");
  lines.push(
    `- Posts publicados: ${snap.posts.publicadosAtual} (anterior: ${snap.posts.publicadosAnterior})`
  );
  lines.push(`- Posts agendados nos proximos 7d: ${snap.posts.agendadosProximos7d}`);
  lines.push(`- Rascunhos/roteiros pendentes: ${snap.posts.rascunhosPendentes}`);
  if (Object.keys(snap.posts.porCategoriaAtual).length) {
    lines.push(`- Por categoria (atual): ${JSON.stringify(snap.posts.porCategoriaAtual)}`);
  }
  if (Object.keys(snap.posts.porCtaAtual).length) {
    lines.push(`- Por CTA (atual): ${JSON.stringify(snap.posts.porCtaAtual)}`);
  }
  lines.push("");
  lines.push("### Leads");
  lines.push(`- Novos leads: ${snap.leads.novosAtual} (anterior: ${snap.leads.novosAnterior})`);
  lines.push(`- Total ativos: ${snap.leads.totalAtivos}`);
  lines.push(`- Perdidos na semana: ${snap.leads.perdidosAtual}`);
  lines.push(`- Por estagio: ${JSON.stringify(snap.leads.porStage)}`);
  lines.push(`- Por temperatura: ${JSON.stringify(snap.leads.porTemperatura)}`);
  lines.push("");
  lines.push("### Corretora");
  lines.push(
    `- Relatorios PAT gerados: ${snap.corretora.relatoriosAtual} (anterior: ${snap.corretora.relatoriosAnterior})`
  );
  lines.push(`- Conversas analisadas (atual): ${snap.corretora.conversasAnalisadasAtual}`);
  lines.push(`- Reunioes agendadas (atual): ${snap.corretora.reunioesAgendadasAtual}`);
  lines.push(`- Acoes pendentes: ${snap.corretora.acoesPendentes}`);
  lines.push(`- Acoes concluidas na semana: ${snap.corretora.acoesConcluidasAtual}`);
  if (snap.corretora.scoresUltimos.length) {
    lines.push(
      `- Ultimos scores: ${snap.corretora.scoresUltimos
        .map((s) => `${s.vendedor}=${s.score} (${s.periodo})`)
        .join(", ")}`
    );
  }
  lines.push("");
  lines.push("### Tarefas");
  lines.push(`- Pendentes: ${snap.tarefas.pendentes}`);
  lines.push(`- Concluidas na semana: ${snap.tarefas.concluidasAtual}`);
  lines.push(`- Atrasadas: ${snap.tarefas.atrasadas}`);
  return lines.join("\n");
}
