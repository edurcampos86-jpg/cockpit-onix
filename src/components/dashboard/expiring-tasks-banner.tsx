"use client";

import { Bell, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface ExpiringTask {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  assignee: { name: string };
  post: { title: string; category: string } | null;
}

const PRIORITY_DOTS: Record<string, string> = {
  urgente: "bg-red-500",
  alta: "bg-orange-500",
  media: "bg-blue-500",
  baixa: "bg-zinc-500",
};

function hoursUntil(dueDate: string): number {
  return Math.floor((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60));
}

export function ExpiringTasksBanner({ tasks }: { tasks: ExpiringTask[] }) {
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-amber-500/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Bell className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-amber-400">
              {tasks.length} {tasks.length === 1 ? "tarefa vence em breve" : "tarefas vencem em breve"}
            </p>
            <p className="text-xs text-muted-foreground">
              Tarefas com prazo nas próximas 24 horas
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-2">
          {tasks.map((task) => {
            const hours = hoursUntil(task.dueDate);
            return (
              <a
                key={task.id}
                href="/tarefas"
                className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-amber-500/30 transition-colors"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOTS[task.priority] ?? "bg-zinc-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                    {task.post && <span>{task.post.title}</span>}
                    <span>{task.assignee.name}</span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-xs text-amber-400 font-medium">
                  <Clock className="h-3 w-3" />
                  {hours <= 0 ? "Hoje" : `${hours}h restantes`}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
