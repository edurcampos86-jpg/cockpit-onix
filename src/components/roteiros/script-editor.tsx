"use client";

import { useState } from "react";
import { ArrowLeft, Save, Clock } from "lucide-react";
import {
  CATEGORY_LABELS,
  CTA_LABELS,
  type PostCategory,
  type CtaType,
} from "@/lib/types";
import type { ScriptData } from "@/app/roteiros/page";

interface ScriptEditorProps {
  script: ScriptData | null; // null = new
  template: ScriptData | null; // template to create from
  onSave: () => void;
  onCancel: () => void;
}

export function ScriptEditor({ script, template, onSave, onCancel }: ScriptEditorProps) {
  const source = script || template;
  const isEditing = !!script;

  const [title, setTitle] = useState(source?.title || "");
  const [category, setCategory] = useState<PostCategory>(
    (source?.category as PostCategory) || "pergunta_semana"
  );
  const [hook, setHook] = useState(source?.hook || "");
  const [body, setBody] = useState(source?.body || "");
  const [cta, setCta] = useState(source?.cta || "");
  const [ctaType, setCtaType] = useState<CtaType>(
    (source?.ctaType as CtaType) || "identificacao"
  );
  const [estimatedTime, setEstimatedTime] = useState(source?.estimatedTime || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("Digite o título do roteiro.");
      return;
    }
    if (!body.trim()) {
      setError("O corpo do roteiro não pode estar vazio.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        title: title.trim(),
        category,
        hook: hook.trim() || null,
        body: body.trim(),
        cta: cta.trim() || null,
        ctaType,
        estimatedTime: estimatedTime.trim() || null,
        isTemplate: false,
      };

      if (isEditing) {
        const res = await fetch(`/api/scripts/${script.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to update");
      } else {
        // Get userId from session
        const meRes = await fetch("/api/auth/me");
        const me = await meRes.json();

        const res = await fetch("/api/scripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, authorId: me.userId }),
        });
        if (!res.ok) throw new Error("Failed to create");
      }

      onSave();
    } catch {
      setError("Erro ao salvar roteiro. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      {/* Back button */}
      <button
        onClick={onCancel}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para roteiros
      </button>

      <h1 className="text-xl font-bold text-foreground mb-1">
        {isEditing ? "Editar Roteiro" : template ? `Novo roteiro a partir de template` : "Novo Roteiro"}
      </h1>
      {template && !isEditing && (
        <p className="text-sm text-muted-foreground mb-6">
          Baseado no template: {CATEGORY_LABELS[template.category as PostCategory]}
        </p>
      )}
      {isEditing && <p className="text-sm text-muted-foreground mb-6">Alterações são salvas ao clicar em &quot;Salvar&quot;</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title + Category row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-foreground">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Você sabe quanto custa um inventário?"
              className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PostCategory)}
              className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {(Object.entries(CATEGORY_LABELS) as [PostCategory, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Hook */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-accent/30">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
              🎣 Gancho
              <span className="text-[10px] font-normal text-muted-foreground">
                A frase de abertura — segura ou perde o espectador
              </span>
            </label>
          </div>
          <textarea
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="Ex: Você sabia que 70% dos brasileiros não sabem quanto custa um inventário?"
            rows={2}
            className="w-full px-4 py-3 bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none resize-none border-none"
          />
        </div>

        {/* Body */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-accent/30">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
              📝 Corpo do Roteiro
              <span className="text-[10px] font-normal text-muted-foreground">
                Desenvolvimento do conteúdo
              </span>
            </label>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Desenvolva o conteúdo aqui...&#10;&#10;Gancho: ...&#10;Desenvolvimento: ...&#10;Conclusão: ..."
            rows={10}
            className="w-full px-4 py-3 bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none resize-y min-h-[200px] border-none"
          />
        </div>

        {/* CTA */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-accent/30">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
              📣 CTA (Chamada para Ação)
              <span className="text-[10px] font-normal text-muted-foreground">
                O que você quer que o espectador faça
              </span>
            </label>
          </div>
          <div className="p-4 space-y-3">
            <textarea
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="Ex: Salve esse conteúdo para consultar depois"
              rows={2}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground">Tipo:</label>
              <div className="flex gap-2">
                {(Object.entries(CTA_LABELS) as [CtaType, string][]).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCtaType(k)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      ctaType === k
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent text-accent-foreground hover:bg-accent/80"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Estimated Time */}
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm font-medium text-foreground">Tempo estimado</label>
          <input
            type="text"
            value={estimatedTime}
            onChange={(e) => setEstimatedTime(e.target.value)}
            placeholder="Ex: 30s, 1min, 90s"
            className="px-3 py-1.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-32"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : isEditing ? "Salvar Alterações" : "Criar Roteiro"}
          </button>
        </div>
      </form>
    </div>
  );
}
