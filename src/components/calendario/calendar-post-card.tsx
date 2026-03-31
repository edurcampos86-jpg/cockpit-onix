"use client";

import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  FORMAT_LABELS,
  type PostStatus,
  type PostFormat,
} from "@/lib/types";
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
}

export function CalendarPostCard({ post, onStatusChange }: CalendarPostCardProps) {
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

  // Fechar menu ao clicar fora
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

  return (
    <div className="relative" ref={menuRef}>
      <div
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        className={cn(
          "px-1.5 py-1 rounded-md text-[10px] leading-tight cursor-grab active:cursor-grabbing transition-all hover:ring-1 hover:ring-primary/30",
          "border bg-background/80 hover:bg-background",
          isExplicitCta
            ? "border-red-500/50 ring-1 ring-red-500/20"
            : "border-border/50",
          onStatusChange && "cursor-pointer"
        )}
        title={`${post.title}\n${FORMAT_LABELS[format]} • ${STATUS_LABELS[status]}${post.scheduledTime ? ` • ${post.scheduledTime}` : ""}${isExplicitCta ? "\n⚠ CTA Explícito" : ""}\nClique para mudar status`}
      >
        <div className="flex items-center gap-1 mb-0.5">
          <span>{FORMAT_ICONS[post.format] || "📝"}</span>
          {post.scheduledTime && (
            <span className="text-muted-foreground">{post.scheduledTime}</span>
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
        </div>
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
