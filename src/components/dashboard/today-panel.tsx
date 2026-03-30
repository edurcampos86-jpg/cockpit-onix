"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface Task {
  id: string;
  title: string;
  status: string;
  type: string;
  priority: string;
  dueDate: string | null;
  post: { title: string; category: string } | null;
  assignee: { name: string };
}

const TYPE_LABELS: Record<string, string> = {
  roteiro: "Roteiro",
  gravacao: "Gravação",
  edicao: "Edição",
  publicacao: "Publicação",
  geral: "Geral",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgente: "text-red-400",
  alta: "text-orange-400",
  media: "text-primary",
  baixa: "text-muted-foreground",
};

interface TodayPanelProps {
  tasks: Task[];
}

export function TodayPanel({ tasks }: TodayPanelProps) {
  const [localTasks, setLocalTasks] = useState(tasks);

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "concluida" ? "pendente" : "concluida";
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      setLocalTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: currentStatus } : t))
      );
    }
  };

  const completed = localTasks.filter((t) => t.status === "concluida").length;
  const total = localTasks.length;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Hoje</CardTitle>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary">
            {completed}/{total}
          </Badge>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-secondary rounded-full h-1.5 mt-2">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-500"
            style={{ width: total > 0 ? `${(completed / total) * 100}%` : "0%" }}
          />
        </div>
      </CardHeader>
      <CardContent>
        {localTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-2 text-emerald-400/50" />
            <p className="text-sm">Nenhuma tarefa para hoje</p>
          </div>
        ) : (
          <div className="space-y-2">
            {localTasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  task.status === "concluida"
                    ? "border-border/30 bg-background/30 opacity-60"
                    : "border-border bg-background hover:border-primary/20"
                }`}
              >
                <Checkbox
                  checked={task.status === "concluida"}
                  onCheckedChange={() => toggleTask(task.id, task.status)}
                  className="mt-0.5 border-primary data-[state=checked]:bg-primary"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      task.status === "concluida" ? "line-through text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {TYPE_LABELS[task.type] || task.type}
                    </Badge>
                    <span className={`text-[10px] ${PRIORITY_COLORS[task.priority]}`}>
                      {task.assignee.name}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
