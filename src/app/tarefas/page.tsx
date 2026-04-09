"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
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
  LayoutGrid,
  List,
  GripVertical,
  Pencil,
} from "lucide-react";
import { TASK_STATUS_LABELS, CATEGORY_LABELS } from "@/lib/types";
import type { TaskStatus, TaskPriority } from "@/lib/types";

type ViewMode = "list" | "kanban";

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

const KANBAN_COLUMNS: { key: TaskStatus; label: string; color: string; bgColor: string }[] = [
  { key: "pendente", label: "Pendente", color: "border-t-zinc-500", bgColor: "bg-zinc-500/10 text-zinc-400" },
  { key: "em_progresso", label: "Em Progresso", color: "border-t-blue-500", bgColor: "bg-blue-500/10 text-blue-400" },
  { key: "concluida", label: "Concluída", color: "border-t-emerald-500", bgColor: "bg-emerald-500/10 text-emerald-400" },
];

export default function TarefasPage() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "todos">("todos");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "todos">("todos");
  const [showNewTask, setShowNewTask] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleEditTask = async (taskId: string, updates: { title?: string; description?: string | null; priority?: string; dueDate?: string | null; status?: string }) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      fetchTasks();
    } catch {
      fetchTasks();
    }
  };

  // Kanban drag & drop
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggingId(taskId);
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    if (taskId) {
      handleStatusChange(taskId, newStatus);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus !== "todos" && t.status !== filterStatus) return false;
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
    <div className="p-6 md:p-8 h-[calc(100vh-0px)] flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 shrink-0">
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

      <ComoFunciona
        proposito="Lista única de tudo o que precisa ser feito para os posts saírem do papel: escrever roteiro, gravar, editar, publicar — automaticamente criadas a partir de cada post."
        comoUsar="Foque primeiro nas atrasadas e nas que vencem em 24h (veja no Painel). Use o modo Kanban para arrastar entre Pendente → Em Progresso → Concluída."
        comoAjuda="Garante que nenhum post fure por esquecimento operacional. Cada peça do conteúdo tem responsável, prazo e status visível."
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6 shrink-0">
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

      {/* Search + Filters + View Toggle */}
      <div className="flex flex-col md:flex-row gap-3 mb-6 shrink-0">
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
          {viewMode === "list" && (
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
          )}
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

          {/* View toggle */}
          <div className="flex items-center bg-accent rounded-lg p-0.5 ml-2">
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
          Carregando tarefas...
        </div>
      ) : viewMode === "kanban" ? (
        /* === KANBAN VIEW === */
        <div className="flex gap-4 overflow-x-auto flex-1 pb-4">
          {KANBAN_COLUMNS.map((col) => {
            const columnTasks = filteredTasks.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                className={`shrink-0 w-80 flex flex-col bg-card/50 rounded-xl border border-border border-t-2 ${col.color}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                {/* Column Header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${col.bgColor}`}>
                      {columnTasks.length}
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {columnTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onClick={() => setEditingTask(task)}
                      className={`bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors group ${
                        draggingId === task.id ? "opacity-50" : ""
                      } ${isOverdue(task.dueDate) && task.status !== "concluida" ? "ring-1 ring-red-500/30" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <GripVertical className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                          <p className={`text-sm font-medium ${
                            task.status === "concluida" ? "line-through text-muted-foreground" : "text-foreground"
                          }`}>
                            {task.title}
                          </p>
                        </div>
                        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          PRIORITY_COLORS[task.priority] ?? "text-zinc-400 bg-zinc-400/10 border-zinc-400/20"
                        }`}>
                          {PRIORITY_LABELS[task.priority] ?? task.priority}
                        </span>
                      </div>

                      {/* Meta info */}
                      <div className="mt-2 space-y-1">
                        {task.post && (
                          <p className="text-[11px] text-primary font-medium flex items-center gap-1">
                            <Calendar className="h-2.5 w-2.5" />
                            {task.post.title}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-2.5 w-2.5" />
                            {task.assignee.name}
                          </span>
                          {task.dueDate && (
                            <span className={`flex items-center gap-1 ${
                              isOverdue(task.dueDate) && task.status !== "concluida" ? "text-red-400" : ""
                            }`}>
                              {isOverdue(task.dueDate) && task.status !== "concluida" && (
                                <AlertTriangle className="h-2.5 w-2.5" />
                              )}
                              {new Date(task.dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Delete */}
                      <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Pencil className="h-2.5 w-2.5" />
                          Clique para editar
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Excluir tarefa"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {columnTasks.length === 0 && (
                    <div className="flex items-center justify-center py-8 text-muted-foreground/50 text-xs">
                      Arraste tarefas aqui
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* === LIST VIEW === */
        filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Nenhuma tarefa encontrada</p>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setEditingTask(task)}
                className={`bg-card border border-border rounded-xl p-4 flex items-center gap-4 group hover:border-primary/30 transition-colors cursor-pointer ${
                  task.status === "concluida" ? "opacity-60" : ""
                }`}
              >
                {/* Status toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
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
                  onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  title="Excluir tarefa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* New Task Dialog */}
      {showNewTask && (
        <NewTaskDialog
          onClose={() => setShowNewTask(false)}
          onSubmit={handleCreateTask}
        />
      )}

      {/* Edit Task Dialog */}
      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={(updates) => {
            handleEditTask(editingTask.id, updates);
            setEditingTask(null);
          }}
          onDelete={() => {
            handleDelete(editingTask.id);
            setEditingTask(null);
          }}
          onStatusChange={(newStatus) => {
            handleStatusChange(editingTask.id, newStatus);
            setEditingTask((prev) => prev ? { ...prev, status: newStatus } : null);
          }}
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

function EditTaskDialog({
  task,
  onClose,
  onSave,
  onDelete,
  onStatusChange,
}: {
  task: TaskData;
  onClose: () => void;
  onSave: (updates: { title?: string; description?: string | null; priority?: string; dueDate?: string | null }) => void;
  onDelete: () => void;
  onStatusChange: (newStatus: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const STATUS_FLOW: { key: TaskStatus; label: string; color: string }[] = [
    { key: "pendente", label: "Pendente", color: "bg-zinc-600" },
    { key: "em_progresso", label: "Em Progresso", color: "bg-blue-600" },
    { key: "concluida", label: "Concluída", color: "bg-emerald-600" },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      dueDate: dueDate ? new Date(dueDate + "T12:00:00").toISOString() : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-lg mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Editar Tarefa</h2>
          </div>
          <div className="flex items-center gap-2">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Excluir tarefa"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={onDelete}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-accent text-accent-foreground"
                >
                  Cancelar
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">
              &times;
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Status Pipeline */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Status
            </label>
            <div className="flex gap-1">
              {STATUS_FLOW.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onStatusChange(s.key)}
                  className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                    s.key === task.status
                      ? `${s.color} text-white`
                      : "bg-accent/50 text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Título *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Detalhes da tarefa..."
            />
          </div>

          {/* Priority + Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
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
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Linked Post Info */}
          {task.post && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-[11px] font-semibold text-primary uppercase mb-1">Post vinculado</p>
              <p className="text-sm text-foreground">{task.post.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {CATEGORY_LABELS[task.post.category as keyof typeof CATEGORY_LABELS] ?? task.post.category}
              </p>
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {task.assignee.name}
            </span>
            <span>
              Criada em {new Date(task.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>

          {/* Actions */}
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
              disabled={!title.trim()}
              className="px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
