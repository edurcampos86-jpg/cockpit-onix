"use client";

import { useState, useEffect } from "react";
import { X, FileText, Sparkles } from "lucide-react";
import {
  FORMAT_LABELS,
  CATEGORY_LABELS,
  CTA_LABELS,
  type PostFormat,
  type PostCategory,
  type CtaType,
} from "@/lib/types";

interface ScriptOption {
  id: string;
  title: string;
  category: string;
  hook: string | null;
  ctaType: string | null;
}

interface NewPostDialogProps {
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}

export function NewPostDialog({ defaultDate, onClose, onCreated }: NewPostDialogProps) {
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<PostFormat>("reel");
  const [category, setCategory] = useState<PostCategory>("pergunta_semana");
  const [ctaType, setCtaType] = useState<CtaType>("identificacao");
  const [scheduledDate, setScheduledDate] = useState(defaultDate);
  const [scheduledTime, setScheduledTime] = useState("12:00");
  const [scriptId, setScriptId] = useState<string>("");
  const [scripts, setScripts] = useState<ScriptOption[]>([]);
  const [generateWithAI, setGenerateWithAI] = useState(false);
  const [topic, setTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Carregar roteiros disponíveis (não-template, sem post vinculado)
  useEffect(() => {
    fetch("/api/scripts?templates=false")
      .then((r) => r.json())
      .then((data: ScriptOption[]) => {
        setScripts(data.filter((s: ScriptOption & { post?: unknown }) => !s.post));
      })
      .catch(() => {});
  }, []);

  // Ao selecionar roteiro, preencher campos
  const handleScriptSelect = (id: string) => {
    setScriptId(id);
    if (id) {
      const script = scripts.find((s) => s.id === id);
      if (script) {
        if (!title) setTitle(script.title);
        setCategory(script.category as PostCategory);
        if (script.ctaType) setCtaType(script.ctaType as CtaType);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Digite o título do post.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          format,
          category,
          ctaType,
          scheduledDate: new Date(scheduledDate + "T" + scheduledTime + ":00").toISOString(),
          scheduledTime,
          status: "rascunho",
          authorId: await getSessionUserId(),
          generateTasks: true,
          generateScript: generateWithAI,
          ...(generateWithAI && topic.trim() ? { topic: topic.trim() } : {}),
          ...(scriptId ? { scriptId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === "CTA_LIMIT") {
          setError(data.message);
          setSaving(false);
          return;
        }
        throw new Error("Failed to create post");
      }

      onCreated();
    } catch {
      setError("Erro ao criar post. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  // Filtrar roteiros pela categoria selecionada
  const filteredScripts = scripts.filter(
    (s) => s.category === category || !category
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-base font-semibold text-foreground">Novo Post</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Pergunta da Semana: O que é holding familiar?"
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              autoFocus
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

          {/* Vincular Roteiro */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Vincular Roteiro
            </label>
            <select
              value={scriptId}
              onChange={(e) => handleScriptSelect(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Sem roteiro vinculado</option>
              {filteredScripts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
              {filteredScripts.length === 0 && scripts.length > 0 && (
                <option disabled>Nenhum roteiro para esta categoria</option>
              )}
            </select>
            {scriptId && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Roteiro será vinculado ao post
              </p>
            )}
          </div>

          {/* Gerar Roteiro com IA */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setGenerateWithAI((v) => !v)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                generateWithAI
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-background border-input text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>{generateWithAI ? "Gerar roteiro com IA — ativado" : "Gerar roteiro com IA automaticamente"}</span>
            </button>
            {generateWithAI && (
              <div className="space-y-1.5 pl-1">
                <label className="text-xs font-medium text-muted-foreground">Tema ou contexto (opcional)</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Ex: ITCMD na Bahia, médico PJ, seguro de vida..."
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  O roteiro será criado pela Claude AI e vinculado ao post automaticamente.
                </p>
              </div>
            )}
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
              <p className="text-[11px] text-red-400 flex items-center gap-1.5 mt-1">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" />
                Regra 80/20: Apenas 1 CTA Explícito permitido por dia
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              {saving ? (generateWithAI ? "Criando + gerando roteiro..." : "Criando...") : "Criar Post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

async function getSessionUserId(): Promise<string> {
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    return data.userId;
  } catch {
    return "unknown";
  }
}
