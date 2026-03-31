import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, CheckSquare, Clock, TrendingUp } from "lucide-react";

interface WeekPostStats {
  total: number;
  published: number;
  scheduled: number;
  editing: number;
  draft: number;
}

interface StatsCardsProps {
  weekPosts: WeekPostStats;
  pendingTasks: number;
  todayTasksCount: number;
  todayCompletedCount: number;
}

export function StatsCards({ weekPosts, pendingTasks, todayTasksCount, todayCompletedCount }: StatsCardsProps) {
  const weekGoalMet = weekPosts.total >= 5;
  const weekProgress = Math.min((weekPosts.total / 5) * 100, 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Posts da semana — com barra de progresso detalhada */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Posts esta semana</p>
            <div className="p-3 rounded-lg bg-primary/10">
              <CalendarDays className="h-6 w-6 text-primary" />
            </div>
          </div>
          <p className={`text-3xl font-bold ${weekGoalMet ? "text-emerald-400" : "text-primary"}`}>
            {weekPosts.total}/5
          </p>
          {/* Barra de progresso segmentada */}
          <div className="w-full h-2 bg-secondary rounded-full mt-2 overflow-hidden flex">
            {weekPosts.published > 0 && (
              <div className="h-full bg-emerald-500" style={{ width: `${(weekPosts.published / 5) * 100}%` }} />
            )}
            {weekPosts.scheduled > 0 && (
              <div className="h-full bg-cyan-500" style={{ width: `${(weekPosts.scheduled / 5) * 100}%` }} />
            )}
            {weekPosts.editing > 0 && (
              <div className="h-full bg-amber-500" style={{ width: `${(weekPosts.editing / 5) * 100}%` }} />
            )}
            {weekPosts.draft > 0 && (
              <div className="h-full bg-zinc-500" style={{ width: `${(weekPosts.draft / 5) * 100}%` }} />
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
            {weekPosts.published > 0 && (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{weekPosts.published} pub.</span>
            )}
            {weekPosts.scheduled > 0 && (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />{weekPosts.scheduled} agend.</span>
            )}
            {weekPosts.editing > 0 && (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{weekPosts.editing} edit.</span>
            )}
            {weekPosts.draft > 0 && (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />{weekPosts.draft} rasc.</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {weekGoalMet ? "Meta atingida!" : `Faltam ${5 - weekPosts.total} para a meta`}
          </p>
        </CardContent>
      </Card>

      {/* Tarefas pendentes */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Tarefas pendentes</p>
              <p className={`text-3xl font-bold mt-1 ${pendingTasks > 10 ? "text-red-400" : "text-primary"}`}>
                {pendingTasks}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {pendingTasks > 10 ? "Atenção: muitas pendências" : "Sob controle"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary/10">
              <CheckSquare className="h-6 w-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tarefas hoje */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Tarefas hoje</p>
              <p className={`text-3xl font-bold mt-1 ${todayCompletedCount === todayTasksCount && todayTasksCount > 0 ? "text-emerald-400" : "text-primary"}`}>
                {todayCompletedCount}/{todayTasksCount}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {todayCompletedCount === todayTasksCount && todayTasksCount > 0 ? "Tudo feito!" : `${todayTasksCount - todayCompletedCount} restantes`}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary/10">
              <Clock className="h-6 w-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reuniões (KPI âncora) */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Reuniões agendadas</p>
              <p className="text-3xl font-bold mt-1 text-primary">0</p>
              <p className="text-xs text-muted-foreground mt-1">KPI principal</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/10">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
