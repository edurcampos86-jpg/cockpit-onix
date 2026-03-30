import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, CheckSquare, Clock, TrendingUp } from "lucide-react";

interface StatsCardsProps {
  publishedThisWeek: number;
  pendingTasks: number;
  todayTasksCount: number;
  todayCompletedCount: number;
}

export function StatsCards({ publishedThisWeek, pendingTasks, todayTasksCount, todayCompletedCount }: StatsCardsProps) {
  const stats = [
    {
      label: "Posts esta semana",
      value: `${publishedThisWeek}/5`,
      icon: CalendarDays,
      color: publishedThisWeek >= 5 ? "text-emerald-400" : "text-primary",
      sublabel: publishedThisWeek >= 5 ? "Meta atingida!" : `Faltam ${5 - publishedThisWeek}`,
    },
    {
      label: "Tarefas pendentes",
      value: pendingTasks.toString(),
      icon: CheckSquare,
      color: pendingTasks > 10 ? "text-red-400" : "text-primary",
      sublabel: pendingTasks > 10 ? "Atenção: muitas pendências" : "Sob controle",
    },
    {
      label: "Tarefas hoje",
      value: `${todayCompletedCount}/${todayTasksCount}`,
      icon: Clock,
      color: todayCompletedCount === todayTasksCount && todayTasksCount > 0 ? "text-emerald-400" : "text-primary",
      sublabel: todayCompletedCount === todayTasksCount ? "Tudo feito!" : `${todayTasksCount - todayCompletedCount} restantes`,
    },
    {
      label: "Reuniões agendadas",
      value: "0",
      icon: TrendingUp,
      color: "text-primary",
      sublabel: "KPI principal",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.sublabel}</p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <stat.icon className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
