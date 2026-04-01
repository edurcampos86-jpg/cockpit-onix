"use client";

import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  FORMAT_LABELS,
  CTA_LABELS,
  CATEGORY_PILAR_MAP,
  PILAR_LABELS,
  type PostStatus,
  type PostFormat,
  type PostCategory,
  type CtaType,
  type PilarEditorial,
} from "@/lib/types";
import { Maximize2, FileText, CheckCircle2 } from "lucide-react";
import type { CalendarPost } from "@/app/calendario/page";

const FORMAT_ICONS: Record<string, string> = {
  reel: "🎬",
  story: "📱",
  carrossel: "📑",
};

const STATUS_ORDER: PostStatus[] = [
  "rascunho",
  "roteiro_pronto",
  "gravado",
  "editado",
  "agendado",
  "publicado",
];

interface CalendarPostCardProps {
  post: CalendarPost;
  onStatusChange?: (postId: string, newStatus: PostStatus) => void;
  onPostClick?: (postId: string) => void;
}

export function CalendarPostCard({ post, onStatusChange, onPostClick }: CalendarPostCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("postId", post.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStatusChange) {
      setShowMenu(!showMenu);
    }
  };

  const handleStatusSelect = (newStatus: PostStatus) => {
    setShowMenu(false);
    if (onStatusChange && newStatus !== post.status) {
      onStatusChange(post.id, newStatus);
    }
  };

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  const status = post.status as PostStatus;
  const format = post.format as PostFormat;
  const isExplicitCta = post.ctaType === "explicito";
  const isAlgoCta = post.ctaType === "algoritmo";
  const pilar = CATEGORY_PILAR_MAP[post.category as PostCategory];
  const totalTasks = post.tasks?.length ?? 0;
  const completedTasks = post.tasks?.filter((t) => t.status === "concluida").length ?? 0;

  const PILAR_BADGE_COLORS: Record<PilarEditorial, string> = {
    P1: "bg-blue-500/20 text-blue-400",
    P2: "bg-amber-500/20 text-amber-400",
    P3: "bg-red-500/20 text-red-400",
    P4: "bg-emerald-500/20 text-emerald-400",
  };

  // Build rich title with script preview
  const buildTitle = () => {
    const lines = [
      post.title,
      `${FORMAT_LABELS[format]} | ${STATUS_LABELS[status]}`,
    ];
    if (post.scheduledTime) lines[1] += ` | ${post.scheduledTime}`;
    if (isExplicitCta) lines.push("CTA Explicito");
    if (post.script?.hook) {
      const hook = post.script.hook.length > 120 ? post.script.hook.slice(0, 120) + "..." : post.script.hook;
      lines.push(`Roteiro: ${hook}`);
      if (post.script.estimatedTime) lines.push(`Tempo: ${post.script.estimatedTime}`);
      if (post.script.ctaType) lines.push(`CTA: ${CTA_LABELS[post.script.ctaType as CtaType] ?? post.script.ctaType}`);
    } else {
      lines.push("Sem roteiro vinculado");
    }
    lines.push("Clique para mudar status");
    return lines.join("\n");
  };

  return (
    <div className="relative" ref={menuRef}>
      <div
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        className={cn(
          "px-1.5 py-1 rounded-md text-[10px] leading-tight cursor-grab active:cursor-grabbing transition-all hover:ring-1 hover:ring-primary/30 group/card",
          "border bg-background/80 hover:bg-background",
          isExplicitCta
            ? "border-red-500/50 ring-1 ring-red-500/20"
            : "border-border/50",
          onStatusChange && "cursor-pointer"
        )}
        title={buildTitle()}
      >
        <div className="flex items-center gap-1 mb-0.5">
          <span>{FORMAT_ICONS[post.format] || "📝"}</span>
          {pilar && (
            <span className={cn("px-1 py-px rounded text-[8px] font-bold", PILAR_BADGE_COLORS[pilar])}>
              {pilar}
            </span>
          )}
          {post.scheduledTime && (
            <span className="text-muted-foreground">{post.scheduledTime}</span>
          )}
          {post.script && (
            <FileText className="h-2.5 w-2.5 text-primary/60 ml-auto" />
          )}
        </div>
        <p className="font-medium text-foreground truncate">{post.title}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className={cn(
              "inline-block w-1.5 h-1.5 rounded-full",
              STATUS_COLORS[status]
            )}
          />
          <span className="text-muted-foreground truncate">
            {STATUS_LABELS[status]}
          </span>
          {isExplicitCta && (
            <span className="ml-auto shrink-0 px-1 py-px rounded bg-red-500/20 text-red-400 font-semibold">
              CTA!
            </span>
          )}
          {isAlgoCta && (
            <span className="ml-auto shrink-0 px-1 py-px rounded bg-violet-500/20 text-violet-400 font-semibold">
              📌
            </span>
          )}
          {onPostClick && (
            <button
              onClick={(e) => { e.stopPropagation(); onPostClick(post.id); }}
              className="ml-auto shrink-0 opacity-0 group-hover/card:opacity-100 p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
              title="Ver detalhes"
            >
              <Maximize2 className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        {/* Task progress bar */}
        {totalTasks > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${completedTasks === totalTasks ? "bg-emerald-500" : "bg-primary/60"}`}
                style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
              />
            </div>
            <span className="text-[8px] text-muted-foreground flex items-center gap-0.5">
              {completedTasks === totalTasks ? (
                <CheckCircle2 className="h-2 w-2 text-emerald-500" />
              ) : (
                `${completedTasks}/${totalTasks}`
              )}
            </span>
          </div>
        )}
      </div>

      {/* Status dropdown menu */}
      {showMenu && (
        <div className="absolute z-50 top-full left-0 mt-1 w-40 bg-card border border-border rounded-lg shadow-xl py-1 animate-in fade-in-0 zoom-in-95">
          <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Alterar status
          </p>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); handleStatusSelect(s); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors",
                s === status
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-accent"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_COLORS[s])} />
              {STATUS_LABELS[s]}
              {s === status && <span className="ml-auto text-primary">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
