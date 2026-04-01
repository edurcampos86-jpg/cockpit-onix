"use client";

import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, type PostCategory } from "@/lib/types";
import type { ScriptData } from "@/app/roteiros/page";
import { Pencil, Copy, Trash2, Link2, Clock, CalendarPlus } from "lucide-react";

const CATEGORY_ICONS: Record<string, string> = {
  pergunta_semana: "❓",
  onix_pratica: "💼",
  patrimonio_mimimi: "💡",
  alerta_patrimonial: "🚨",
  sabado_bastidores: "🎬",
};

const FORMAT_ICONS: Record<string, string> = {
  reel: "🎬",
  story: "📱",
  carrossel: "📑",
};

interface ScriptListProps {
  scripts: ScriptData[];
  onEdit: (script: ScriptData) => void;
  onDuplicate: (script: ScriptData) => void;
  onDelete: (id: string) => void;
  onCreatePost?: (script: ScriptData) => void;
}

export function ScriptList({ scripts, onEdit, onDuplicate, onDelete, onCreatePost }: ScriptListProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-accent/30">
        <span className="text-sm">📝</span>
        <h3 className="text-sm font-semibold text-foreground">
          Meus Roteiros ({scripts.length})
        </h3>
      </div>

      {scripts.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum roteiro criado ainda</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use um template ou crie um roteiro do zero
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {scripts.map((script) => (
            <ScriptCard
              key={script.id}
              script={script}
              onEdit={() => onEdit(script)}
              onDuplicate={() => onDuplicate(script)}
              onDelete={() => onDelete(script.id)}
              onCreatePost={onCreatePost && !script.post ? () => onCreatePost(script) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScriptCard({
  script,
  onEdit,
  onDuplicate,
  onDelete,
  onCreatePost,
}: {
  script: ScriptData;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCreatePost?: () => void;
}) {
  const categoryLabel = CATEGORY_LABELS[script.category as PostCategory] || script.category;
  const hasPost = !!script.post;
  const postDate = script.post
    ? new Date(script.post.scheduledDate).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      })
    : null;

  return (
    <div className="p-4 hover:bg-accent/20 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-2 mb-1">
            <span>{CATEGORY_ICONS[script.category] || "📝"}</span>
            <h4
              className="text-sm font-medium text-foreground truncate cursor-pointer hover:text-primary transition-colors"
              onClick={onEdit}
            >
              {script.title}
            </h4>
          </div>

          {/* Hook preview */}
          {script.hook && (
            <p className="text-xs text-muted-foreground ml-7 line-clamp-2 mb-2">
              <span className="text-primary/70 font-medium">Gancho:</span> {script.hook}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 ml-7 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
              {categoryLabel}
            </span>

            {script.estimatedTime && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {script.estimatedTime}
              </span>
            )}

            {hasPost && (
              <span className="flex items-center gap-1 text-[10px] text-primary/80">
                <Link2 className="h-3 w-3" />
                {FORMAT_ICONS[script.post!.format] || ""} {postDate}
              </span>
            )}

            <span className="text-[10px] text-muted-foreground/60">
              {new Date(script.updatedAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onCreatePost && (
            <button
              onClick={onCreatePost}
              className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              title="Criar post com este roteiro"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Duplicar"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
