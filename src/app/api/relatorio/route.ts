import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const weekOffset = parseInt(searchParams.get("weekOffset") || "0");

  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const [posts, tasks, leads] = await Promise.all([
    prisma.post.findMany({
      where: { scheduledDate: { gte: monday, lte: sunday } },
      include: { tasks: true },
    }),
    prisma.task.findMany({
      where: {
        OR: [
          { dueDate: { gte: monday, lte: sunday } },
          { completedAt: { gte: monday, lte: sunday } },
        ],
      },
    }),
    prisma.lead.findMany({
      where: { enteredAt: { gte: monday, lte: sunday } },
    }),
  ]);

  // Posts por status
  const postsByStatus = {
    total: posts.length,
    publicado: posts.filter((p) => p.status === "publicado").length,
    agendado: posts.filter((p) => p.status === "agendado").length,
    editado: posts.filter((p) => p.status === "editado" || p.status === "gravado").length,
    rascunho: posts.filter((p) => p.status === "rascunho" || p.status === "roteiro_pronto").length,
  };

  // Posts por categoria (quadro fixo)
  const categories = ["pergunta_semana", "onix_pratica", "patrimonio_mimimi", "alerta_patrimonial", "sabado_bastidores"];
  const postsByCategory = categories.map((cat) => ({
    category: cat,
    count: posts.filter((p) => p.category === cat).length,
    published: posts.filter((p) => p.category === cat && p.status === "publicado").length,
  }));

  // CTAs
  const ctaExplicit = posts.filter((p) => p.ctaType === "explicito").length;
  const ctaImplicit = posts.filter((p) => p.ctaType === "implicito").length;
  const ctaIdentification = posts.filter((p) => p.ctaType === "identificacao").length;

  // Tarefas
  const taskStats = {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === "concluida").length,
    pending: tasks.filter((t) => t.status === "pendente").length,
    inProgress: tasks.filter((t) => t.status === "em_progresso").length,
  };

  // Leads
  const leadStats = {
    newLeads: leads.length,
    hot: leads.filter((l) => l.temperature === "quente").length,
    warm: leads.filter((l) => l.temperature === "morno").length,
    cold: leads.filter((l) => l.temperature === "frio").length,
    byProduct: {
      investimentos: leads.filter((l) => l.productInterest === "investimentos").length,
      seguro_vida: leads.filter((l) => l.productInterest === "seguro_vida").length,
      consorcio_saude: leads.filter((l) => l.productInterest === "consorcio_saude").length,
      imoveis: leads.filter((l) => l.productInterest === "imoveis").length,
      msp: leads.filter((l) => l.productInterest === "msp").length,
    },
  };

  // Meta semanal
  const weekGoalMet = postsByStatus.total >= 5;

  // Regra 80/20 semanal
  const maxExplicitCta = Math.max(1, Math.floor(postsByStatus.total * 0.2));
  const ctaRuleOk = ctaExplicit <= maxExplicitCta;

  return NextResponse.json({
    period: {
      start: monday.toISOString(),
      end: sunday.toISOString(),
      weekOffset,
    },
    posts: postsByStatus,
    postsByCategory,
    cta: { explicito: ctaExplicit, implicito: ctaImplicit, identificacao: ctaIdentification, maxExplicitCta, ctaRuleOk },
    tasks: taskStats,
    leads: leadStats,
    weekGoalMet,
  });
}
