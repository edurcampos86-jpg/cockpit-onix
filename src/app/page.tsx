import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { WeekCalendar } from "@/components/dashboard/week-calendar";
import { TodayPanel } from "@/components/dashboard/today-panel";
import { StatsCards } from "@/components/dashboard/stats-cards";

export default async function DashboardPage() {
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

  const [weekPosts, todayTasks, pendingTasksCount] = await Promise.all([
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
  ]);

  const publishedThisWeek = weekPosts.filter((p) => p.status === "publicado").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Painel de Comando"
        description={`Semana de ${startOfWeek.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} a ${endOfWeek.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`}
      />

      <div className="p-8 space-y-8">
        {/* Stats Cards */}
        <StatsCards
          publishedThisWeek={publishedThisWeek}
          pendingTasks={pendingTasksCount}
          todayTasksCount={todayTasks.length}
          todayCompletedCount={todayTasks.filter((t) => t.status === "concluida").length}
        />

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
