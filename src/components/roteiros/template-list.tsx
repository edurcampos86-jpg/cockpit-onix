"use client";

import { CATEGORY_LABELS, type PostCategory } from "@/lib/types";
import type { ScriptData } from "@/app/roteiros/page";
import { FileText, ArrowRight } from "lucide-react";

const CATEGORY_ICONS: Record<string, string> = {
  pergunta_semana: "❓",
  onix_pratica: "💼",
  patrimonio_mimimi: "💡",
  alerta_patrimonial: "🚨",
  sabado_bastidores: "🎬",
};

interface TemplateListProps {
  templates: ScriptData[];
  onUseTemplate: (template: ScriptData) => void;
}

export function TemplateList({ templates, onUseTemplate }: TemplateListProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-accent/30">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          Templates ({templates.length})
        </h3>
      </div>

      <div className="divide-y divide-border">
        {templates.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum template encontrado
          </div>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="p-4 hover:bg-accent/20 transition-colors group">
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">
                  {CATEGORY_ICONS[t.category] || "📝"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {CATEGORY_LABELS[t.category as PostCategory] || t.category}
                  </p>
                  {t.hook && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {t.hook}
                    </p>
                  )}
                  <button
                    onClick={() => onUseTemplate(t)}
                    className="flex items-center gap-1 mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    Usar template <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
