"use client";

import { useState, useEffect } from "react";
import { X, CalendarPlus } from "lucide-react";
import { DAY_FORMAT_MAP, FORMAT_LABELS, type PostFormat } from "@/lib/types";
import type { ScriptData } from "@/app/roteiros/page";

interface CreatePostFromScriptDialogProps {
  script: ScriptData;
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePostFromScriptDialog({ script, onClose, onCreated }: CreatePostFromScriptDialogProps) {
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [scheduledTime, setScheduledTime] = useState("12:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => { if (data.userId) setUserId(data.userId); })
      .catch(() => {});
  }, []);

  // Inferir formato pelo dia da semana
  const inferredFormat = (() => {
    const date = new Date(scheduledDate + "T12:00:00");
    const dow = date.getDay();
    return DAY_FORMAT_MAP[dow] || "reel";
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: script.title,
          format: inferredFormat,
          category: script.category,
          ctaType: script.ctaType || "implicito",
          scheduledDate: new Date(scheduledDate + "T" + scheduledTime + ":00").toISOString(),
          scheduledTime,
          status: "roteiro_pronto",
          authorId: userId,
          scriptId: script.id,
          generateTasks: true,
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

      onCreated();
    } catch {
      setError("Erro ao criar post. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" />
            Criar Post com Roteiro
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Script info */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <p className="text-sm font-medium text-foreground">{script.title}</p>
            {script.hook && (
              <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{script.hook}</p>
            )}
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Data de publicação</label>
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

          <p className="text-[11px] text-muted-foreground">
            Formato: {FORMAT_LABELS[inferredFormat as PostFormat]} | Status: Roteiro Pronto | Tarefas serão criadas automaticamente
          </p>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !userId}
              className="px-5 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              {saving ? "Criando..." : "Criar Post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
