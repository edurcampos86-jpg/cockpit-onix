"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CalendarPostCard } from "@/components/calendario/calendar-post-card";
import type { CalendarPost } from "@/app/calendario/page";
import { Plus } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_DAYS,
  type PostCategory,
  type PostStatus,
} from "@/lib/types";

interface CalendarWeekGridProps {
  currentDate: Date;
  posts: CalendarPost[];
  loading: boolean;
  onDayClick: (dateStr: string) => void;
  onPostMoved: (postId: string, newDate: string) => void;
  onPostStatusChange?: (postId: string, newStatus: PostStatus) => void;
  onPostClick?: (postId: string) => void;
}

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEKDAY_FULL = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// Quadro fixo esperado para cada dia da semana (1=Seg...6=Sáb)
const EXPECTED_CATEGORY: Record<number, PostCategory> = {
  1: "pergunta_semana",
  2: "onix_pratica",
  3: "patrimonio_mimimi",
  4: "alerta_patrimonial",
  6: "sabado_bastidores",
};

export function CalendarWeekGrid({
  currentDate,
  posts,
  loading,
  onDayClick,
  onPostMoved,
  onPostStatusChange,
  onPostClick,
}: CalendarWeekGridProps) {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const weekDays = useMemo(() => {
    const dow = currentDate.getDay();
    const monday = new Date(currentDate);
    monday.setDate(currentDate.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return {
        date,
        dateStr: formatDateStr(date),
        dayOfWeek: ((i + 1) % 7) || 7, // 1=Seg, 2=Ter...7=Dom
        jsDay: date.getDay(), // 0=Dom, 1=Seg...6=Sáb
      };
    });
  }, [currentDate]);

  const postsByDate = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {};
    for (const post of posts) {
      const d = new Date(post.scheduledDate);
      const key = formatDateStr(d);
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.scheduledTime || "").localeCompare(b.scheduledTime || ""));
    }
    return map;
  }, [posts]);

  const today = formatDateStr(new Date());

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(dateStr);
  };

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const postId = e.dataTransfer.getData("postId");
    if (postId) {
      onPostMoved(postId, dateStr);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground text-sm">Carregando calendário...</div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-7">
        {weekDays.map((day, idx) => {
          const dayPosts = postsByDate[day.dateStr] || [];
          const isToday = day.dateStr === today;
          const isDragOver = day.dateStr === dragOverDate;
          const expectedCat = EXPECTED_CATEGORY[day.jsDay];
          const hasCategoryPost = expectedCat && dayPosts.some((p) => p.category === expectedCat);
          const isPast = day.date < new Date() && !isToday;

          return (
            <div
              key={day.dateStr}
              className={cn(
                "min-h-[350px] border-r border-border last:border-r-0 flex flex-col transition-colors",
                isDragOver && "bg-primary/5",
                isToday && "bg-primary/5"
              )}
              onDragOver={(e) => handleDragOver(e, day.dateStr)}
              onDragLeave={() => setDragOverDate(null)}
              onDrop={(e) => handleDrop(e, day.dateStr)}
            >
              {/* Day Header */}
              <div className={cn(
                "px-3 py-3 border-b border-border text-center",
                isToday && "bg-primary/10"
              )}>
                <p className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  isToday ? "text-primary" : "text-muted-foreground"
                )}>
                  {WEEKDAYS[idx]}
                </p>
                <p className={cn(
                  "text-2xl font-bold mt-0.5",
                  isToday ? "text-primary" : "text-foreground"
                )}>
                  {day.date.getDate()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {day.date.toLocaleDateString("pt-BR", { month: "short" })}
                </p>
              </div>

              {/* Quadro fixo esperado */}
              {expectedCat && (
                <div className={cn(
                  "mx-2 mt-2 px-2 py-1.5 rounded-md text-[10px] font-medium border border-dashed",
                  hasCategoryPost
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                    : isPast
                      ? "border-red-500/30 bg-red-500/5 text-red-400"
                      : "border-primary/20 bg-primary/5 text-primary/70"
                )}>
                  {hasCategoryPost ? "✓ " : isPast ? "✗ " : "○ "}
                  {CATEGORY_LABELS[expectedCat]}
                </div>
              )}

              {/* Posts */}
              <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
                {dayPosts.map((post) => (
                  <CalendarPostCard key={post.id} post={post} onStatusChange={onPostStatusChange} onPostClick={onPostClick} />
                ))}
              </div>

              {/* Add button */}
              <div className="p-2 border-t border-border/50">
                <button
                  onClick={() => onDayClick(day.dateStr)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Novo post
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
