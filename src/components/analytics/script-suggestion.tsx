"use client";

import { useState } from "react";
import { Wand2, CheckCircle2, X, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

interface ScriptSuggestionProps {
  recommendationId: string;
  titulo: string;
  ajusteRoteiro: {
    categoria: string;
    campo: string;
    sugestao: string;
  };
  onApplied?: () => void;
}

const CAMPO_LABELS: Record<string, string> = {
  hook: "Hook (abertura)",
  body: "Corpo do conteúdo",
  cta: "CTA (chamada para ação)",
  hashtags: "Hashtags",
  title: "Título",
};

const CATEGORIA_LABELS: Record<string, string> = {
  patrimonio_mimimi: "Patrimônio sem Mimimi",
  alerta_patrimonial: "Alerta Patrimonial",
  onix_pratica: "Onix na Prática",
  sabado_bastidores: "Sábado Bastidores",
  pergunta_semana: "Pergunta da Semana",
};

export function ScriptSuggestion({
  recommendationId,
  titulo,
  ajusteRoteiro,
  onApplied,
}: ScriptSuggestionProps) {
  const [expanded, setExpanded] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ajusteRoteiro.sugestao);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/analytics/apply-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId,
          ajuste: titulo,
          campo: ajusteRoteiro.campo,
          novoValor: ajusteRoteiro.sugestao,
        }),
      });

      if (res.ok) {
        setApplied(true);
        onApplied?.();
      }
    } finally {
      setApplying(false);
    }
  };

  if (applied) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <p className="text-xs text-emerald-400 font-medium">Ajuste registrado com sucesso!</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-amber-400 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-400">Sugestão de ajuste de roteiro</p>
            <p className="text-[11px] text-muted-foreground">
              {CATEGORIA_LABELS[ajusteRoteiro.categoria] || ajusteRoteiro.categoria} —{" "}
              {CAMPO_LABELS[ajusteRoteiro.campo] || ajusteRoteiro.campo}
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
        <div className="px-3 pb-3 space-y-3">
          <div className="p-3 rounded-lg bg-background/50 border border-border">
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
              {ajusteRoteiro.sugestao}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copiado!" : "Copiar"}
            </button>
            <button
              onClick={handleApply}
              disabled={applying}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {applying ? "Registrando..." : "Registrar como implementado"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
