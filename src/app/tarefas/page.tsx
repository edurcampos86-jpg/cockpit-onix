"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Plus,
  Search,
  CheckCircle2,
  Circle,
  Clock,
  Trash2,
  Calendar,
  User,
  AlertTriangle,
  Filter,
} from "lucide-react";
import { TASK_STATUS_LABELS, CATEGORY_LABELS } from "@/lib/types";
import type { TaskStatus, TaskPriority } from "@/lib/types";

interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  type: string;
  createdAt: string;
  assignee: { name: string };
  post: { title: string; category: string } | null;
}

const PRIORITY_LABELS: Record<string, string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgente: "text-red-400 bg-red-400/10 border-red-400/20",
  alta: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  media: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  baixa: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pendente: <Circle className="h-4 w-4 text-zinc-500" />,
  em_progresso: <Clock className="h-4 w-4 text-blue-400" />,
  concluida: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
};

export default function TarefasPage() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "todos">("todos");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "todos">("todos");
  const [showNewTask, setShowNewTask] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "todos") params.set("status", filterStatus);
      const res = await fetch(`/api/tasks?${params.toString()}`);
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      fetchTasks();
    }
  };

  const handleDelete = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    } catch {
      fetchTasks();
    }
  };

  const handleCreateTask = async (formData: FormData) => {
    const body = {
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      priority: formData.get("priority") as string,
      dueDate: formData.get("dueDate")
        ? new Date(formData.get("dueDate") as string).toISOString()
        : null,
      assigneeId: formData.get("assigneeId") as string,
    };

    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setShowNewTask(false);
      fetchTasks();
    } catch (error) {
      console.error("Error creating task:", error);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filterPriority !== "todos" && t.priority !== filterPriority) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pendingCount = tasks.filter((t) => t.status === "pendente").length;
  const inProgressCount = tasks.filter((t) => t.status === "em_progresso").length;
  const completedCount = tasks.filter((t) => t.status === "concluida").length;

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <PageHeader
          title="Tarefas"
          description="Gerencie suas tarefas e acompanhe o progresso"
        />
        <button
          onClick={() => setShowNewTask(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm self-start"
        >
          <Plus className="h-4 w-4" />
          Nova Tarefa
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium mb-1">
            <Circle className="h-3 w-3" />
            Pendentes
          </div>
          <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-400 text-xs font-medium mb-1">
            <Clock className="h-3 w-3" />
            Em Progresso
          </div>
          <p className="text-2xl font-bold text-foreground">{inProgressCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium mb-1">
            <CheckCircle2 className="h-3 w-3" />
            Concluídas
          </div>
          <p className="text-2xl font-bold text-foreground">{completedCount}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarefas..."
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "todos")}
            className="px-3 py-2 text-sm rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="em_progresso">Em Progresso</option>
            <option value="concluida">Concluída</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as TaskPriority | "todos")}
            className="px-3 py-2 text-sm rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="todos">Todas as prioridades</option>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px] text-muted-foreground text-sm">
          Carregando tarefas...
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Nenhuma tarefa encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className={`bg-card border border-border rounded-xl p-4 flex items-center gap-4 group hover:border-primary/30 transition-colors ${
                task.status === "concluida" ? "opacity-60" : ""
              }`}
            >
              {/* Status toggle */}
              <button
                onClick={() => {
                  const nextStatus =
                    task.status === "pendente"
                      ? "em_progresso"
                      : task.status === "em_progresso"
                        ? "concluida"
                        : "pendente";
                  handleStatusChange(task.id, nextStatus);
                }}
                className="shrink-0 hover:scale-110 transition-transform"
                title={`Status: ${TASK_STATUS_LABELS[task.status as TaskStatus] ?? task.status}`}
              >
                {STATUS_ICONS[task.status] ?? <Circle className="h-4 w-4 text-zinc-500" />}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    task.status === "concluida"
                      ? "line-through text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {task.title}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {task.post && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {task.post.title}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {task.assignee.name}
                  </span>
                  {task.dueDate && (
                    <span
                      className={`flex items-center gap-1 ${
                        isOverdue(task.dueDate) && task.status !== "concluida"
                          ? "text-red-400"
                          : ""
                      }`}
                    >
                      {isOverdue(task.dueDate) && task.status !== "concluida" && (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {new Date(task.dueDate).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* Priority badge */}
              <span
                className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  PRIORITY_COLORS[task.priority] ?? "text-zinc-400 bg-zinc-400/10 border-zinc-400/20"
                }`}
              >
                {PRIORITY_LABELS[task.priority] ?? task.priority}
              </span>

              {/* Delete */}
              <button
                onClick={() => handleDelete(task.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                title="Excluir tarefa"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* New Task Dialog */}
      {showNewTask && (
        <NewTaskDialog
          onClose={() => setShowNewTask(false)}
          onSubmit={handleCreateTask}
        />
      )}
    </div>
  );
}

function NewTaskDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.userId) setUsers([{ id: data.userId, name: data.name }]);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    await onSubmit(formData);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Nova Tarefa</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Título *</label>
            <input
              name="title"
              required
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Descreva a tarefa..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Descrição</label>
            <textarea
              name="description"
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Detalhes opcionais..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Prioridade</label>
              <select
                name="priority"
                defaultValue="media"
                className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="urgente">Urgente</option>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Prazo</label>
              <input
                name="dueDate"
                type="date"
                className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          {users.length > 0 && (
            <input type="hidden" name="assigneeId" value={users[0].id} />
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || users.length === 0}
              className="px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              {submitting ? "Criando..." : "Criar Tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
