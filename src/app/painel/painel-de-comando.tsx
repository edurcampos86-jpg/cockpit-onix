import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { WeekCalendar } from "@/components/dashboard/week-calendar";
import { TodayPanel } from "@/components/dashboard/today-panel";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { WeekCategoriesAlert } from "@/components/calendario/week-categories-alert";
import { PlanningReminderBanner } from "@/components/dashboard/planning-reminder-banner";
import { OverdueTasksBanner } from "@/components/dashboard/overdue-tasks-banner";
import { ExpiringTasksBanner } from "@/components/dashboard/expiring-tasks-banner";
import {
  RiscoEvasaoBanner,
  type ClienteEmRisco,
} from "@/components/dashboard/risco-evasao-banner";
import { riscoEvasaoReuniao } from "@/lib/cadencia-core";
import { rbacEnforcementHabilitado, resolverCgesVisiveis } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

/**
 * Painel de Comando — o corpo que morava direto em `src/app/page.tsx`.
 *
 * Virou componente para ter DOIS endereços com UMA implementação:
 *   • `/`       — quando a flag `HUB_ECOSSISTEMA` está OFF (comportamento de sempre);
 *   • `/painel` — endereço próprio e estável, que continua valendo com a flag ON.
 *
 * Sem isso, ligar o hub deixava o painel sem rota nenhuma: a sidebar aponta o
 * item "Painel" para a raiz, e a raiz passaria a ser o hub. O conteúdo abaixo
 * é o mesmo de antes, movido sem alteração de lógica.
 */
export async function PainelDeComando() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  const [weekPosts, todayTasks, pendingTasksCount, overdueTasks, expiringTasks] = await Promise.all([
    prisma.post.findMany({
      where: { scheduledDate: { gte: startOfWeek, lte: endOfWeek } },
      include: { author: { select: { name: true } }, tasks: true },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.task.findMany({
      where: { dueDate: { gte: todayStart, lte: todayEnd } },
      include: { assignee: { select: { name: true } }, post: { select: { title: true, category: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    prisma.task.count({ where: { status: { not: "concluida" } } }),
    prisma.task.findMany({
      where: {
        status: { not: "concluida" },
        dueDate: { lt: todayStart },
      },
      include: { assignee: { select: { name: true } }, post: { select: { title: true, category: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.task.findMany({
      where: {
        status: { not: "concluida" },
        dueDate: { gte: todayStart, lte: tomorrow },
      },
      include: { assignee: { select: { name: true } }, post: { select: { title: true, category: true } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  // Clientes em risco de evasão: sem reunião AGENDADA e com o teto da classe
  // já vencido. Mesma regra da tabela de clientes (cadencia-core.ts) — não é
  // recalculada aqui de outro jeito, é a mesma função.
  //
  // Respeita o RBAC igual à página de clientes: quem só enxerga a própria
  // carteira não recebe no painel o alerta de cliente que não é dele.
  //
  // Falha silenciosa de propósito: o painel inteiro não pode quebrar porque a
  // tabela de clientes não existe ainda ou o RBAC não resolveu.
  let clientesEmRisco: ClienteEmRisco[] = [];
  try {
    const whereClientes: { assessorCge?: { in: string[] } } = {};
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const cges = await resolverCgesVisiveis(ctx);
      if (cges) whereClientes.assessorCge = { in: cges };
    }
    const candidatos = await prisma.clienteBackoffice.findMany({
      where: {
        ...whereClientes,
        OR: [{ ativacaoConta: "Ativa" }, { ativacaoConta: null }],
      },
      select: {
        id: true,
        nome: true,
        classificacao: true,
        ultimaReuniaoAt: true,
        proximaReuniaoAt: true,
        cadenciaReuniaoDiasOverride: true,
      },
    });
    clientesEmRisco = candidatos.flatMap((c) => {
      const r = riscoEvasaoReuniao(
        c.classificacao,
        c.ultimaReuniaoAt,
        c.proximaReuniaoAt,
        c.cadenciaReuniaoDiasOverride,
      );
      if (r.status !== "risco") return [];
      return [
        {
          id: c.id,
          nome: c.nome,
          classificacao: c.classificacao,
          diasVencidos: Math.abs(r.diasAteLimite),
          teto: r.cadencia,
          tetoManual: r.override,
        },
      ];
    });
  } catch {
    // tabela de clientes pode não existir neste ambiente
  }


  const weekPostStats = {
    total: weekPosts.length,
    published: weekPosts.filter((p) => p.status === "publicado").length,
    scheduled: weekPosts.filter((p) => p.status === "agendado").length,
    editing: weekPosts.filter((p) => p.status === "editado" || p.status === "gravado").length,
    draft: weekPosts.filter((p) => p.status === "rascunho" || p.status === "roteiro_pronto").length,
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Painel de Comando"
        description={`Semana de ${startOfWeek.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} a ${endOfWeek.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`}
      />

      <div className="p-8 space-y-8">
        <ComoFunciona
          proposito="Sua visão executiva da semana de mídias sociais. Mostra, em uma tela, se você está postando, se há pendências e o que precisa fazer hoje."
          comoUsar="Comece o dia aqui. Olhe os 4 cards no topo, depois os alertas (atrasadas e que vencem em 24h) e por fim o calendário da semana com a aba 'Hoje' à direita."
          comoAjuda="Evita você esquecer posts, perder prazos e furar a cadência dos Quadros Fixos. Centraliza tudo o que importa para o seu Instagram em um único painel."
        />

        {/* Stats Cards */}
        <StatsCards
          weekPosts={weekPostStats}
          pendingTasks={pendingTasksCount}
          todayTasksCount={todayTasks.length}
          todayCompletedCount={todayTasks.filter((t) => t.status === "concluida").length}
        />

        {/* Risco de evasão — clientes sem reunião agendada além do teto */}
        <RiscoEvasaoBanner clientes={clientesEmRisco} />

        {/* Alerta de Tarefas Atrasadas */}
        <OverdueTasksBanner tasks={JSON.parse(JSON.stringify(overdueTasks))} />

        {/* Alerta de Tarefas Expirando (24h) */}
        <ExpiringTasksBanner tasks={JSON.parse(JSON.stringify(expiringTasks))} />

        {/* Alerta de Quadros Fixos */}
        <WeekCategoriesAlert
          posts={weekPosts.map((p) => ({ category: p.category }))}
          compact
        />

        {/* Lembrete de Planejamento */}
        <PlanningReminderBanner />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Week Calendar - takes 2 columns */}
          <div className="xl:col-span-2">
            <WeekCalendar posts={JSON.parse(JSON.stringify(weekPosts))} />
          </div>

          {/* Today Panel - takes 1 column */}
          <div>
            <TodayPanel tasks={JSON.parse(JSON.stringify(todayTasks))} />
          </div>
        </div>
      </div>
    </div>
  );
}
