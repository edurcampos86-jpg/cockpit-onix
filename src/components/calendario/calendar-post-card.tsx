"use client";

import { cn } from "@/lib/utils";
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

export function CalendarPostCard({ post }: { post: CalendarPost }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("postId", post.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const status = post.status as PostStatus;
  const format = post.format as PostFormat;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        "px-1.5 py-1 rounded-md text-[10px] leading-tight cursor-grab active:cursor-grabbing transition-all hover:ring-1 hover:ring-primary/30",
        "border border-border/50 bg-background/80 hover:bg-background"
      )}
      title={`${post.title}\n${FORMAT_LABELS[format]} • ${STATUS_LABELS[status]}${post.scheduledTime ? ` • ${post.scheduledTime}` : ""}`}
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
      </div>
    </div>
  );
}
