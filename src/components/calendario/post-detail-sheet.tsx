"use client";

import { useState, useEffect } from "react";
import { X, Trash2, Save, FileText, CheckCircle2, Circle, Clock, ExternalLink, Copy, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { ScriptVersionHistory } from "@/components/roteiros/script-version-history";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  FORMAT_LABELS,
  CATEGORY_LABELS,
  CTA_LABELS,
  TASK_STATUS_LABELS,
  type PostStatus,
  type PostFormat,
  type PostCategory,
  type CtaType,
  type TaskStatus,
} from "@/lib/types";

interface PostDetail {
  id: string;
  title: string;
  format: string;
  category: string;
  status: string;
  scheduledDate: string;
  scheduledTime: string | null;
  ctaType: string | null;
  hashtags: string | null;
  notes: string | null;
  publishedUrl: string | null;
  author: { name: string };
  script: { id: string; title: string; hook: string | null; body: string; cta: string | null; ctaType: string | null; estimatedTime: string | null } | null;
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
  }[];
}

interface PostDetailSheetProps {
  postId: string;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
  onDuplicated?: () => void;
}

const STATUS_ORDER: PostStatus[] = [
  "rascunho",
  "roteiro_pronto",
  "gravado",
  "editado",
  "agendado",
  "publicado",
];

const TASK_STATUS_ICONS: Record<string, React.ReactNode> = {
  pendente: <Circle className="h-3.5 w-3.5 text-zinc-500" />,
  em_progresso: <Clock className="h-3.5 w-3.5 text-blue-400" />,
  concluida: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
};

export function PostDetailSheet({ postId, onClose, onUpdated, onDeleted, onDuplicated }: PostDetailSheetProps) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [scriptHook, setScriptHook] = useState("");
  const [scriptBody, setScriptBody] = useState("");
  const [scriptCta, setScriptCta] = useState("");
  const [savingScript, setSavingScript] = useState(false);

  // Editable fields
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<PostFormat>("reel");
  const [category, setCategory] = useState<PostCategory>("pergunta_semana");
  const [status, setStatus] = useState<PostStatus>("rascunho");
  const [ctaType, setCtaType] = useState<CtaType>("identificacao");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [notes, setNotes] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");

  useEffect(() => {
    const fetchPost = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/posts/${postId}`);
        if (!res.ok) throw new Error("Not found");
        const data: PostDetail = await res.json();
        setPost(data);
        setTitle(data.title);
        setFormat(data.format as PostFormat);
        setCategory(data.category as PostCategory);
        setStatus(data.status as PostStatus);
        setCtaType((data.ctaType as CtaType) || "identificacao");
        setScheduledDate(new Date(data.scheduledDate).toISOString().split("T")[0]);
        setScheduledTime(data.scheduledTime || "");
        setNotes(data.notes || "");
        setPublishedUrl(data.publishedUrl || "");
        if (data.script) {
          setScriptHook(data.script.hook || "");
          setScriptBody(data.script.body || "");
          setScriptCta(data.script.cta || "");
        }
      } catch {
        setError("Erro ao carregar post.");
      } finally {
        setLoading(false);
      }
    };
    fetchPost();
  }, [postId]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          format,
          category,
          status,
          ctaType,
          scheduledDate: new Date(scheduledDate + "T12:00:00").toISOString(),
          scheduledTime: scheduledTime || null,
          notes: notes || null,
          publishedUrl: publishedUrl || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === "CTA_LIMIT") {
          setError(data.message);
          setSaving(false);
          return;
        }
        throw new Error("Failed");
      }

      onUpdated();
    } catch {
      setError("Erro ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      onDeleted();
    } catch {
      setError("Erro ao excluir post.");
    }
  };

  const handleSaveScript = async () => {
    if (!post?.script) return;
    setSavingScript(true);
    try {
      await fetch(`/api/scripts/${post.script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hook: scriptHook || null,
          body: scriptBody,
          cta: scriptCta || null,
        }),
      });
      setShowScriptEditor(false);
    } catch {
      // silently fail
    } finally {
      setSavingScript(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    setError("");
    try {
      const res = await fetch(`/api/posts/${postId}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      if (onDuplicated) onDuplicated();
      else onUpdated();
    } catch {
      setError("Erro ao duplicar post.");
    } finally {
      setDuplicating(false);
    }
  };

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    if (!post) return;
    setPost({
      ...post,
      tasks: post.tasks.map((t) =>
        t.id === taskId ? { ...t, status: newStatus } : t
      ),
    });
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      // silently fail
    }
  };

  const completedTasks = post?.tasks.filter((t) => t.status === "concluida").length ?? 0;
  const totalTasks = post?.tasks.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-card border-l border-border shadow-2xl h-full overflow-y-auto animate-in slide-in-from-right-full duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Detalhes do Post</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDuplicate}
              disabled={duplicating}
              className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              title="Duplicar post (+7 dias)"
            >
              <Copy className="h-4 w-4" />
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Excluir post"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Confirmar exclusão
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-accent text-accent-foreground"
                >
                  Cancelar
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[300px] text-muted-foreground text-sm">
            Carregando...
          </div>
        ) : !post ? (
          <div className="flex items-center justify-center min-h-[300px] text-muted-foreground text-sm">
            Post não encontrado
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Status Pipeline */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Pipeline de Status
              </label>
              <div className="flex gap-1">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${
                      s === status
                        ? `${STATUS_COLORS[s]} text-white`
                        : "bg-accent/50 text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Título</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Format + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Formato</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as PostFormat)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {(Object.entries(FORMAT_LABELS) as [PostFormat, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PostCategory)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {(Object.entries(CATEGORY_LABELS) as [PostCategory, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Data</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Horário</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            {/* CTA Type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Tipo de CTA</label>
              <select
                value={ctaType}
                onChange={(e) => setCtaType(e.target.value as CtaType)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {(Object.entries(CTA_LABELS) as [CtaType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {ctaType === "explicito" && (
                <p className="text-[11px] text-red-400 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  Regra 80/20: Apenas 1 CTA Explícito permitido por dia
                </p>
              )}
            </div>

            {/* Published URL */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">URL de publicação</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={publishedUrl}
                  onChange={(e) => setPublishedUrl(e.target.value)}
                  placeholder="https://instagram.com/p/..."
                  className="flex-1 px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {publishedUrl && (
                  <a
                    href={publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Observações</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anotações sobre o post..."
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            {/* Linked Script + Inline Editor */}
            {post.script && (
              <div className="space-y-2">
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-primary uppercase">Roteiro Vinculado</span>
                    </div>
                    <button
                      onClick={() => setShowScriptEditor(!showScriptEditor)}
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <Pencil className="h-3 w-3" />
                      {showScriptEditor ? "Fechar" : "Editar"}
                      {showScriptEditor ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                  <p className="text-sm font-medium text-foreground">{post.script.title}</p>
                  {post.script.hook && !showScriptEditor && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{post.script.hook}</p>
                  )}
                </div>

                {/* Inline Script Editor */}
                {showScriptEditor && (
                  <div className="space-y-3 bg-background/50 border border-border rounded-lg p-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Gancho (Hook)</label>
                      <textarea
                        value={scriptHook}
                        onChange={(e) => setScriptHook(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                        placeholder="Frase de abertura dos 3 primeiros segundos..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Corpo do Roteiro</label>
                      <textarea
                        value={scriptBody}
                        onChange={(e) => setScriptBody(e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                        placeholder="Desenvolvimento do conteudo..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">CTA</label>
                      <textarea
                        value={scriptCta}
                        onChange={(e) => setScriptCta(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                        placeholder="Chamada para acao..."
                      />
                    </div>
                    <button
                      onClick={handleSaveScript}
                      disabled={savingScript}
                      className="w-full px-3 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {savingScript ? "Salvando roteiro..." : "Salvar Roteiro"}
                    </button>

                    {/* Version History */}
                    <ScriptVersionHistory
                      scriptId={post.script.id}
                      compact
                      onRestored={() => {
                        // Recarregar o post para pegar a versão restaurada
                        window.location.reload();
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Tasks */}
            {totalTasks > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Tarefas do Post
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {completedTasks}/{totalTasks} concluídas
                  </span>
                </div>
                {/* Progress */}
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: totalTasks > 0 ? `${(completedTasks / totalTasks) * 100}%` : "0%" }}
                  />
                </div>
                <div className="space-y-1.5">
                  {post.tasks.map((task) => {
                    const nextStatus =
                      task.status === "pendente"
                        ? "em_progresso"
                        : task.status === "em_progresso"
                          ? "concluida"
                          : "pendente";
                    return (
                      <div
                        key={task.id}
                        className={`flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-border/50 ${
                          task.status === "concluida" ? "opacity-60" : ""
                        }`}
                      >
                        <button
                          onClick={() => handleTaskStatusChange(task.id, nextStatus)}
                          className="shrink-0 hover:scale-110 transition-transform"
                          title={TASK_STATUS_LABELS[task.status as TaskStatus] ?? task.status}
                        >
                          {TASK_STATUS_ICONS[task.status] ?? <Circle className="h-3.5 w-3.5 text-zinc-500" />}
                        </button>
                        <span
                          className={`text-xs flex-1 ${
                            task.status === "concluida"
                              ? "line-through text-muted-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.dueDate && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {new Date(task.dueDate).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              <button
                onClick={handleDuplicate}
                disabled={duplicating}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-border text-foreground font-medium rounded-lg hover:bg-accent transition-colors disabled:opacity-50 text-sm"
              >
                <Copy className="h-4 w-4" />
                {duplicating ? "Duplicando..." : "Duplicar"}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>

            {/* Meta */}
            <div className="text-[11px] text-muted-foreground text-center pt-2 border-t border-border">
              Criado por {post.author.name}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
